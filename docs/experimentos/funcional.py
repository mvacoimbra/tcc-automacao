import json, time, urllib.request
B='http://127.0.0.1:3000/api'
def req(m, p, body=None):
    r=urllib.request.Request(B+p, method=m, data=json.dumps(body).encode() if body is not None else None, headers={'Content-Type':'application/json'})
    return json.loads(urllib.request.urlopen(r).read())
est=lambda: req('GET','/dispositivos/sala01/estado')
def cfg(**k): return req('POST','/dispositivos/sala01/config',k)
def amb(**k): return req('POST','/demo/ambiente',k)
def show(tag):
    e=est(); l=e.get('leitura',e)
    print(tag, json.dumps({k:l.get(k) for k in ('estado','pir','lux','temperatura','luz','hvac')} if isinstance(l,dict) else e))
    return l


def esperar(cond, limite=60, passo=0.2):
    t0=time.time()
    while time.time()-t0<limite:
        l=est()['leitura']
        if cond(l): return time.time()-t0, l
        time.sleep(passo)
    return None, est()['leitura']

R={}
amb(temperatura=28, lux=120); cfg(tOcupadoMs=30000, janelaConfMs=0, pulsosConf=1, luxLimiar=300, tempAlvo=26); time.sleep(3)
# CT-02/03 parte 1
req('POST','/demo/pir'); dt,l=esperar(lambda l:l['estado']=='OCUPADO',10)
R['ocupar']={'tempo_s':round(dt,2),'luz':l['luz'],'hvac':l['hvac'],'lux':l['lux'],'temp':l['temperatura']}
amb(lux=600); dt,l=esperar(lambda l:l['luz']==False,10); R['lux600']={'tempo_s':round(dt,2),'luz':l['luz'],'estado':l['estado']}
amb(lux=120); esperar(lambda l:l['luz'],10)
cfg(tempAlvo=30); dt,l=esperar(lambda l:l['hvac']==False,10); R['alvo30']={'tempo_s':round(dt,2),'hvac':l['hvac']}
cfg(tempAlvo=26); dt,l=esperar(lambda l:l['hvac'],10); R['alvo26']={'tempo_s':round(dt,2),'hvac':l['hvac']}
# CT-04 desocupação com t_ocupado=30s: mede do fim do pulso do PIR até DESOCUPADO
req('POST','/demo/pir'); esperar(lambda l:l['pir'],10)
dtfim,_=esperar(lambda l:not l['pir'],15); t_fim=time.time()
dt,l=esperar(lambda l:l['estado']=='DESOCUPADO',60)
R['desocupa30']={'apos_fim_pir_s':round(dt,2),'luz':l['luz'],'hvac':l['hvac'],'duracao_pulso_pir_s':round(dtfim,2)}
# CT-05 config remota: t_ocupado=10s
cfg(tOcupadoMs=10000)
req('POST','/demo/pir'); esperar(lambda l:l['estado']=='OCUPADO',10); esperar(lambda l:l['pir'],10)
esperar(lambda l:not l['pir'],15)
dt,l=esperar(lambda l:l['estado']=='DESOCUPADO',60); R['desocupa10']={'apos_fim_pir_s':round(dt,2)}
cfg(tOcupadoMs=30000)
json.dump(R,open('funcional.json','w'),indent=1); print(json.dumps(R,indent=1))
