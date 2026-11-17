/* Dados deliberadamente fictícios. Usados somente após escolher "Ver demonstração". */
window.SPTRANS_DEMO = (() => {
  const lines = [
    {cl:1273,lc:false,lt:'8000',sl:1,tl:10,tp:'PÇA. RAMOS DE AZEVEDO',ts:'TERMINAL LAPA'},
    {cl:34041,lc:false,lt:'8000',sl:2,tl:10,tp:'PÇA. RAMOS DE AZEVEDO',ts:'TERMINAL LAPA'},
    {cl:1989,lc:false,lt:'7021',sl:1,tl:10,tp:'TERM. JOÃO DIAS',ts:'JD. MARACÁ'},
    {cl:2520,lc:false,lt:'875A',sl:1,tl:10,tp:'PERDIZES',ts:'AEROPORTO'}
  ];
  const vehicle = (p,py,px,a=true) => ({p,a,ta:'2026-11-17T17:30:00Z',py,px});
  const positions = {hr:'14:30',l:[
    {c:'8000-10',cl:1273,sl:1,lt0:'TERMINAL LAPA',lt1:'PÇA. RAMOS DE AZEVEDO',qv:3,vs:[vehicle(81101,-23.5417,-46.6393),vehicle(81102,-23.5337,-46.6555),vehicle(81103,-23.5251,-46.6754,false)]},
    {c:'8000-10',cl:34041,sl:2,lt0:'PÇA. RAMOS DE AZEVEDO',lt1:'TERMINAL LAPA',qv:2,vs:[vehicle(81201,-23.5224,-46.6965),vehicle(81202,-23.5321,-46.6601)]},
    {c:'7021-10',cl:1989,sl:1,lt0:'JD. MARACÁ',lt1:'TERM. JOÃO DIAS',qv:2,vs:[vehicle(74101,-23.5701,-46.6823),vehicle(74102,-23.5817,-46.6901,false)]},
    {c:'875A-10',cl:2520,sl:1,lt0:'AEROPORTO',lt1:'PERDIZES',qv:2,vs:[vehicle(85101,-23.5532,-46.6661),vehicle(85102,-23.5595,-46.6573)]}
  ]};
  const stops = [
    {cp:340015329,np:'AFONSO BRAZ B/C1',ed:'R. ARMINDA / R. BALTHAZAR DA VEIGA',py:-23.592938,px:-46.672727},
    {cp:700016623,np:'ANA CINTRA B/C',ed:'R. ANA CINTRA / AV. SÃO JOÃO',py:-23.538763,px:-46.646925},
    {cp:700016624,np:'PRAÇA DA REPÚBLICA',ed:'AV. IPIRANGA / PRAÇA DA REPÚBLICA',py:-23.5431,px:-46.6422},
    {cp:700016625,np:'PAULISTA / CONSOLAÇÃO',ed:'AV. PAULISTA / R. DA CONSOLAÇÃO',py:-23.5558,px:-46.6624}
  ];
  const corridors = [{cc:1,nc:'Campo Limpo'},{cc:2,nc:'Santo Amaro / 9 de Julho'},{cc:3,nc:'Pirituba / Lapa / Centro'},{cc:4,nc:'Paes de Barros'},{cc:5,nc:'Inajar / Rio Branco / Centro'},{cc:6,nc:'Expresso Tiradentes'}];
  const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function arrivals(stop,lineCode) {
    const selected = lineCode ? positions.l.filter(line=>line.cl===Number(lineCode)) : positions.l.slice(0,2);
    return {...stop,l:selected.map((line,index)=>({...line,vs:line.vs.slice(0,2).map((bus,i)=>({...bus,t:`14:${String(34+index*4+i*6).padStart(2,'0')}`}))}))};
  }
  function get(path) {
    const url = new URL(path,'http://demo.local'); const p = url.searchParams;
    if(url.pathname==='/api/status') return {ok:true,configured:true,mode:'demo'};
    if(url.pathname==='/api/linhas') return lines.filter(line=>(!p.get('sentido')||line.sl===Number(p.get('sentido')))&&normalize(`${line.lt} ${line.tp} ${line.ts}`).includes(normalize(p.get('q')||'')));
    if(url.pathname==='/api/posicoes') return p.get('codigo_linha') ? {hr:positions.hr,vs:positions.l.find(line=>line.cl===Number(p.get('codigo_linha')))?.vs||[]} : positions;
    if(url.pathname==='/api/paradas') return stops.filter(stop=>!p.get('q')||normalize(`${stop.np} ${stop.ed}`).includes(normalize(p.get('q'))));
    if(url.pathname==='/api/previsoes') {
      if(p.get('codigo_parada')) return {hr:'14:30',p:arrivals(stops.find(stop=>stop.cp===Number(p.get('codigo_parada')))||stops[0],p.get('codigo_linha'))};
      return {hr:'14:30',ps:stops.map(stop=>({...stop,vs:arrivals(stop,p.get('codigo_linha')).l.flatMap(line=>line.vs)}))};
    }
    if(url.pathname==='/api/corredores') return corridors;
    if(url.pathname==='/api/empresas') return [{hr:'14:30',e:[{a:1,e:[{a:1,c:101,n:'OPERADORA FICTÍCIA — DEMONSTRAÇÃO'}]}]}];
    if(url.pathname==='/api/garagens') return {hr:'14:30',l:[]};
    if(url.pathname==='/api/velocidades') return {demonstracao:true,observacao:'Este recurso não possui exemplo. Use a API real para consultar velocidades.'};
    throw new Error('Recurso sem exemplo de demonstração.');
  }
  return {get};
})();
