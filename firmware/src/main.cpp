#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHTesp.h>
#include <sys/time.h>
#include <math.h>

#include "config.h"
#include "occupancy_fsm.h"

// ---------------- Estado compartilhado (protegido por mutex) ----------------
struct Leituras {
  bool pir;
  float temperatura;
  float umidade;
  float lux;
};

struct Saidas {
  bool luz;
  bool hvac;
};

static Leituras gLeituras{false, NAN, NAN, 0.0f};
static Saidas gSaidas{};
static FsmState gFsm{};
static FsmConfig gCfg{T_OCUPADO_MS, JANELA_CONF_MS, PULSOS_CONF};
static float gLuxLimiar = LUX_LIMIAR;
static float gTempAlvo = TEMP_ALVO;
static volatile bool gMudou = false;  // força publicação imediata

static SemaphoreHandle_t gMutex;

static DHTesp dht;
static WiFiClient wifiClient;
static PubSubClient mqtt(wifiClient);

// RAII: trava no construtor e destrava no destrutor (fim do bloco { }).
struct Lock {
  Lock() { xSemaphoreTake(gMutex, portMAX_DELAY); }
  ~Lock() { xSemaphoreGive(gMutex); }
};

// ---------------- Conversão LDR -> lux ----------------
// Fórmula da documentação do Wokwi (wokwi-photoresistor-sensor),
// adaptada para ADC de 12 bits e 3,3 V. Em hardware real, calibrar.
static float adcParaLux(int adc) {
  constexpr float GAMMA = 0.7f;
  constexpr float RL10 = 50.0f;
  const float tensao = adc / 4095.0f * 3.3f;
  if (tensao >= 3.29f) return 0.0f;
  const float resistencia = 2000.0f * tensao / (1.0f - tensao / 3.3f);
  if (resistencia < 1.0f) return 100000.0f;
  return powf(RL10 * 1e3f * powf(10.0f, GAMMA) / resistencia, 1.0f / GAMMA);
}

static int64_t epochMs() {
  timeval tv;
  gettimeofday(&tv, nullptr);
  if (tv.tv_sec < 1700000000) return 0;  // NTP ainda não sincronizou
  return static_cast<int64_t>(tv.tv_sec) * 1000 + tv.tv_usec / 1000;
}

// ---------------- Task: Aquisição ----------------
static void taskAquisicao(void*) {
  TickType_t proximo = xTaskGetTickCount();
  uint32_t ultimoDht = 0;
  float temp = NAN, umid = NAN;

  for (;;) {
    const bool pir = digitalRead(PIN_PIR) == HIGH;
    const float lux = adcParaLux(analogRead(PIN_LDR));

    if (millis() - ultimoDht >= PERIODO_DHT_MS) {
      const TempAndHumidity th = dht.getTempAndHumidity();
      if (dht.getStatus() == DHTesp::ERROR_NONE) {
        temp = th.temperature;
        umid = th.humidity;
      }
      ultimoDht = millis();
    }

    {
      Lock l;
      gLeituras = {pir, temp, umid, lux};
    }
    // vTaskDelayUntil mantém período fixo (não acumula deriva como vTaskDelay)
    vTaskDelayUntil(&proximo, pdMS_TO_TICKS(PERIODO_AQUISICAO_MS));
  }
}

// ---------------- Task: Decisão ----------------
static void taskDecisao(void*) {
  TickType_t proximo = xTaskGetTickCount();

  for (;;) {
    {
      Lock l;
      const bool mudouEstado = fsmStep(gFsm, gCfg, gLeituras.pir, millis());
      const bool ocupado = gFsm.estado == Ocupacao::OCUPADO;

      const Saidas novas{
          ocupado && gLeituras.lux < gLuxLimiar,
          ocupado && !isnan(gLeituras.temperatura) && gLeituras.temperatura > gTempAlvo,
      };

      if (mudouEstado || novas.luz != gSaidas.luz || novas.hvac != gSaidas.hvac) {
        gSaidas = novas;
        gMudou = true;
        Serial.printf("[decisao] estado=%s luz=%d hvac=%d\n",
                      ocupacaoStr(gFsm.estado), novas.luz, novas.hvac);
      }
    }  // mutex liberado aqui, antes de dormir
    vTaskDelayUntil(&proximo, pdMS_TO_TICKS(PERIODO_DECISAO_MS));
  }
}

// ---------------- Task: Atuação ----------------
static void taskAtuacao(void*) {
  TickType_t proximo = xTaskGetTickCount();
  for (;;) {
    Saidas s;
    {
      Lock l;
      s = gSaidas;
    }
    digitalWrite(PIN_LUZ, s.luz ? HIGH : LOW);
    // Protótipo: LED representa o comando IR (transmissão IR não é simulável
    // no Wokwi). Em hardware real: IRremoteESP8266 com o código do fabricante.
    digitalWrite(PIN_HVAC, s.hvac ? HIGH : LOW);
    vTaskDelayUntil(&proximo, pdMS_TO_TICKS(PERIODO_ATUACAO_MS));
  }
}

// ---------------- Task: Comunicação (MQTT) ----------------
// Callback roda dentro de mqtt.loop(), ou seja, na task de comunicação.
static void onConfig(char*, byte* payload, unsigned int len) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, len)) {
    Serial.println("[mqtt] config inválida");
    return;
  }
  Lock l;
  if (doc["tOcupadoMs"].is<uint32_t>()) gCfg.tOcupadoMs = doc["tOcupadoMs"];
  if (doc["janelaConfMs"].is<uint32_t>()) gCfg.janelaConfMs = doc["janelaConfMs"];
  if (doc["pulsosConf"].is<uint8_t>()) gCfg.pulsosConf = doc["pulsosConf"];
  if (doc["luxLimiar"].is<float>()) gLuxLimiar = doc["luxLimiar"];
  if (doc["tempAlvo"].is<float>()) gTempAlvo = doc["tempAlvo"];
  Serial.printf("[mqtt] config: tOcupado=%u janela=%u pulsos=%u lux=%.0f temp=%.1f\n",
                gCfg.tOcupadoMs, gCfg.janelaConfMs, gCfg.pulsosConf, gLuxLimiar, gTempAlvo);
}

static void garantirConexao() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.begin(WIFI_SSID, WIFI_PASS, WIFI_CHANNEL);
    while (WiFi.status() != WL_CONNECTED) vTaskDelay(pdMS_TO_TICKS(250));
    Serial.printf("[wifi] conectado: %s\n", WiFi.localIP().toString().c_str());
    configTime(0, 0, "pool.ntp.org");  // relógio p/ medir latência fim a fim
  }
  while (!mqtt.connected()) {
    if (mqtt.connect("esp32-" DEVICE_ID)) {
      mqtt.subscribe(TOPIC_CONFIG);
      Serial.println("[mqtt] conectado");
    } else {
      Serial.printf("[mqtt] falha rc=%d, nova tentativa em 2 s\n", mqtt.state());
      vTaskDelay(pdMS_TO_TICKS(2000));
    }
  }
}

static void publicarEstado(uint32_t seq) {
  JsonDocument doc;
  {
    Lock l;
    doc["dispositivo"] = DEVICE_ID;
    doc["seq"] = seq;
    doc["ts"] = epochMs();
    doc["estado"] = ocupacaoStr(gFsm.estado);
    doc["pir"] = gLeituras.pir;
    doc["temperatura"] = gLeituras.temperatura;
    doc["umidade"] = gLeituras.umidade;
    doc["lux"] = gLeituras.lux;
    doc["luz"] = gSaidas.luz;
    doc["hvac"] = gSaidas.hvac;
  }
  char buf[384];
  serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(TOPIC_ESTADO, buf);
}

// PubSubClient não é thread-safe: somente esta task usa o cliente MQTT.
static void taskComunicacao(void*) {
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(512);  // padrão de 256 B descarta payloads maiores em silêncio
  mqtt.setCallback(onConfig);

  uint32_t seq = 0;
  uint32_t ultimaPub = 0;
  for (;;) {
    garantirConexao();
    mqtt.loop();
    if (gMudou || millis() - ultimaPub >= PERIODO_PUBLICACAO_MS) {
      gMudou = false;
      publicarEstado(seq++);
      ultimaPub = millis();
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_PIR, INPUT);
  pinMode(PIN_LUZ, OUTPUT);
  pinMode(PIN_HVAC, OUTPUT);
  dht.setup(PIN_DHT, DHTesp::DHT22);

  gMutex = xSemaphoreCreateMutex();

  // Core 0: pilha Wi-Fi/MQTT. Core 1: controle local.
  // O controle continua funcionando mesmo sem rede (decisão na borda).
  xTaskCreatePinnedToCore(taskComunicacao, "comunicacao", 8192, nullptr, 1, nullptr, 0);
  xTaskCreatePinnedToCore(taskAquisicao, "aquisicao", 4096, nullptr, 3, nullptr, 1);
  xTaskCreatePinnedToCore(taskDecisao, "decisao", 4096, nullptr, 2, nullptr, 1);
  xTaskCreatePinnedToCore(taskAtuacao, "atuacao", 2048, nullptr, 2, nullptr, 1);
}

void loop() {
  vTaskDelete(nullptr);  // tudo roda nas tasks do FreeRTOS
}
