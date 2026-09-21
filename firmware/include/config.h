#pragma once

// ---------- Rede ----------
#define WIFI_SSID    "Wokwi-GUEST"
#define WIFI_PASS    ""
#define WIFI_CHANNEL 6  // fixar o canal acelera a conexão no Wokwi

// VS Code + Private Gateway: "host.wokwi.internal"
// Simulador web (sem gateway): use um broker público, ex. "broker.hivemq.com"
#define MQTT_HOST "host.wokwi.internal"
#define MQTT_PORT 1883

#define DEVICE_ID    "sala01"
#define TOPIC_ESTADO "tcc/" DEVICE_ID "/estado"
#define TOPIC_CONFIG "tcc/" DEVICE_ID "/config"

// ---------- Pinos ----------
#define PIN_PIR  27
#define PIN_DHT  15
#define PIN_LDR  34  // ADC1 obrigatório: ADC2 fica indisponível com Wi-Fi ativo
#define PIN_LUZ  26  // representa o relé SSR de iluminação
#define PIN_HVAC 25  // representa o comando IR do ar-condicionado

// ---------- Parâmetros de controle (ajustáveis via MQTT) ----------
#define T_OCUPADO_MS   30000  // tempo sem movimento até DESOCUPADO
#define JANELA_CONF_MS 0      // 0 = modelo da Figura 3 (sem confirmação)
#define PULSOS_CONF    1      // detecções exigidas dentro da janela
#define LUX_LIMIAR     300.0f
#define TEMP_ALVO      26.0f

// ---------- Períodos das tarefas ----------
#define PERIODO_AQUISICAO_MS  200
#define PERIODO_DHT_MS        2000  // DHT22 não suporta leituras < 2 s
#define PERIODO_DECISAO_MS    100
#define PERIODO_ATUACAO_MS    100
#define PERIODO_PUBLICACAO_MS 2000
