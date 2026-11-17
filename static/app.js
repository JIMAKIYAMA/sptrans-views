/* Interface do visualizador. As chamadas autenticadas são feitas pelo Flask. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = {mode:'live',view:'monitor',line:null,vehicles:[],positions:null,stops:[],corridors:null,explorerData:null,epoch:0,positionRequest:0,lineRequest:0,stopRequest:0,arrivalRequest:0,explorerRequest:0,positionAbort:null,map:null,markers:null,stopMarkers:null,hasFitted:false};
  const controllers = new Set();
  const titles = {monitor:['Uma cidade. Milhares de caminhos.','Acompanhe os ônibus e explore os dados do transporte público.'],stops:['Seu próximo embarque, mais perto.','Consulte paradas e previsões de chegada.'],corridors:['As conexões que movem São Paulo.','Conheça os corredores e explore suas paradas.'],explorer:['O transporte, em dados abertos.','Consulte os recursos da API Olho Vivo.']};
  const number = value => Number(value).toLocaleString('pt-BR');
  const text = (tag,value,className) => {const node=document.createElement(tag);node.textContent=value??'';if(className)node.className=className;return node;};
  const svg = name => {const node=document.createElementNS('http://www.w3.org/2000/svg','svg');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href',`#i-${name}`);node.append(use);node.setAttribute('aria-hidden','true');return node;};
  function notice(message,success=false){$('notice').textContent=message;$('notice').classList.toggle('success',success);$('notice').hidden=!message;}
  function connection(label,status){$('connection-status').replaceChildren(document.createElement('i'),document.createTextNode(label));$('connection-status').className=`status-pill ${status||''}`;}
  function current(epoch){return epoch===state.epoch;}
  function pathFor(path,params={}){const query=new URLSearchParams(Object.entries(params).filter(([,v])=>v!==null&&v!==undefined&&v!==''));return `/api/${path}${query.size?'?'+query:''}`;}

  async function request(path,{signal}={}){
    if(state.mode==='demo') return structuredClone(window.SPTRANS_DEMO.get(path));
    const controller = new AbortController();controllers.add(controller);
    const onAbort=()=>controller.abort();signal?.addEventListener('abort',onAbort,{once:true});
    if(signal?.aborted)controller.abort();
    const timeout=setTimeout(()=>controller.abort('timeout'),65000);
    try{
      const response=await fetch(path,{signal:controller.signal,headers:{Accept:'application/json'}});
      let data;try{data=await response.json();}catch{throw new Error('O servidor retornou uma resposta inesperada. Tente novamente.');}
      if(!response.ok)throw new Error(data.error||'Não foi possível consultar a SPTrans.');
      return data;
    }catch(error){
      if(controller.signal.aborted&&controller.signal.reason==='timeout')throw new Error('A consulta demorou mais que o esperado. Tente atualizar.');
      if(error.name==='TypeError')throw new Error('Não foi possível acessar o servidor local. Confira se o Flask está em execução.');
      throw error;
    }finally{clearTimeout(timeout);controllers.delete(controller);signal?.removeEventListener('abort',onAbort);}
  }

  function showView(view){
    state.view=view;
    document.querySelectorAll('.view-panel').forEach(panel=>panel.hidden=panel.id!==`view-${view}`);
    document.querySelectorAll('[data-view]').forEach(button=>{const active=button.dataset.view===view;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
    [$('page-title').textContent,$('page-subtitle').textContent]=titles[view];
    if(view==='monitor')setTimeout(()=>state.map?.invalidateSize(),0);
    if(view==='corridors'&&!state.corridors)loadCorridors();
  }

  function initializeMap(){
    if(!window.L){$('map-fallback').hidden=false;return;}
    state.map=L.map('vehicle-map',{preferCanvas:true,zoomControl:false}).setView([-23.5505,-46.6333],12);
    L.control.zoom({position:'topright'}).addTo(state.map);
    state.markers=L.layerGroup().addTo(state.map);
    state.stopMarkers=L.layerGroup().addTo(state.map);
    // A origem real da página identifica a aplicação, conforme a política do OSM.
    const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,
      referrerPolicy:'strict-origin-when-cross-origin',
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(state.map);
    let loaded=false;
    tiles.once('tileload',()=>{loaded=true;$('map-fallback').hidden=true;});
    tiles.on('tileerror',()=>{if(!loaded)$('map-fallback').hidden=false;});
    setTimeout(()=>{if(!loaded)$('map-fallback').hidden=false;},12000);
  }
  function validCoordinates(item){return Number.isFinite(item.py)&&Number.isFinite(item.px)&&Math.abs(item.py)<=90&&Math.abs(item.px)<=180;}
  function captureTime(value){if(!value)return 'Não informado';const date=new Date(value);return Number.isNaN(date.getTime())?String(value):date.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit',day:'2-digit',month:'2-digit'});}
  function drawVehicles(){
    if(!state.map)return;state.markers.clearLayers();
    const icon=L.divIcon({className:'bus-marker',html:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17v3m12-3v3M5 11h14M7 15h.01M17 15h.01M7 3h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/></svg>',iconSize:[27,29],iconAnchor:[13,15]});
    const points=[];
    state.vehicles.forEach(bus=>{
      if(!validCoordinates(bus))return;points.push([bus.py,bus.px]);
      const popup=document.createElement('div');popup.append(text('strong',bus.linha),text('p',`Veículo ${bus.p}`),text('p',`Destino: ${bus.destino||'Não informado'}`),text('p',`Acessível: ${bus.a===true?'Sim':bus.a===false?'Não':'Não informado'}`),text('small',`Capturado em ${captureTime(bus.ta)}`));
      L.marker([bus.py,bus.px],{icon,title:`Linha ${bus.linha}, veículo ${bus.p}`,keyboard:true}).bindPopup(popup).addTo(state.markers);
    });
    if(points.length&&!state.hasFitted){state.map.fitBounds(L.latLngBounds(points),{padding:[45,45],maxZoom:15});state.hasFitted=true;}
  }
  function lineCode(line){return `${line.lt}-${String(line.tl).padStart(2,'0')}`;}
  // /Linha fornece letreiros por sentido. /Posicao é que identifica origem e destino.
  function lineDescription(line){return `${line.tp} / ${line.ts}`;}
  function flattenPositions(data){
    if(!data)return[];
    if(Array.isArray(data.l))return data.l.flatMap(line=>(line.vs||[]).map(bus=>({...bus,linha:line.c,codigo_linha:line.cl,sentido:line.sl,origem:line.lt1,destino:line.lt0})));
    return(data.vs||[]).map(bus=>({...bus,linha:state.line?lineCode(state.line):'—',codigo_linha:state.line?.cl,sentido:state.line?.sl}));
  }
  function drawTable(){
    const fragment=document.createDocumentFragment();
    state.vehicles.forEach(bus=>{const row=document.createElement('tr');const first=document.createElement('td');first.append(text('span',bus.linha,'line-label'));row.append(first,text('td',bus.destino||'—'),text('td',bus.p),text('td',bus.a===true?'Sim':bus.a===false?'Não':'—',bus.a===true?'yes':''),text('td',captureTime(bus.ta)),text('td',bus.py??'—'),text('td',bus.px??'—'));fragment.append(row);});
    if(!state.vehicles.length){const row=document.createElement('tr');const cell=text('td','Nenhum veículo retornado nesta consulta.','empty-cell');cell.colSpan=7;row.append(cell);fragment.append(row);}
    $('vehicle-table-body').replaceChildren(fragment);$('table-count').textContent=`${number(state.vehicles.length)} veículo(s) na resposta. Horários convertidos para São Paulo.`;
  }
  function renderPositions(data){
    state.positions=data;state.vehicles=flattenPositions(data);
    $('stat-vehicles').textContent=number(state.vehicles.length);
    $('stat-lines').textContent=number(new Set(state.vehicles.map(bus=>bus.codigo_linha)).size);
    $('stat-accessible').textContent=number(state.vehicles.filter(bus=>bus.a===true).length);
    $('stat-time').textContent=data?.hr||'—';
    $('updated-at').textContent=state.mode==='demo'?'horário fictício de exemplo':`consultado às ${new Date().toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})}`;
    $('scope-badge').textContent=state.line?lineCode(state.line):'Toda a cidade';
    const invalid=state.vehicles.filter(bus=>!validCoordinates(bus)).length;
    $('positions-description').textContent=`${state.mode==='demo'?'Exemplo fictício · ':''}${number(state.vehicles.length)} veículo(s) na consulta${invalid?` · ${invalid} sem coordenadas válidas no mapa`:''}.`;
    $('export-csv').disabled=false;$('export-json').disabled=false;drawVehicles();drawTable();
  }
  function clearPositionDisplay(){
    renderPositions(null);
    ['stat-vehicles','stat-lines','stat-accessible','stat-time'].forEach(id=>$(id).textContent='—');
    $('updated-at').textContent='aguardando consulta';$('positions-description').textContent='Consultando posições do escopo selecionado…';
    $('export-csv').disabled=true;$('export-json').disabled=true;
  }
  async function loadPositions(){
    const epoch=state.epoch;const serial=++state.positionRequest;
    state.positionAbort?.abort();const controller=new AbortController();state.positionAbort=controller;
    const button=$('refresh-positions');button.classList.add('loading');button.disabled=true;
    try{const data=await request(pathFor('posicoes',{codigo_linha:state.line?.cl}),{signal:controller.signal});if(!current(epoch)||serial!==state.positionRequest)return;notice('');renderPositions(data);connection(state.mode==='demo'?'Dados de demonstração':'API conectada',state.mode==='demo'?'demo':'live');}
    catch(error){if(error.name==='AbortError'||!current(epoch)||serial!==state.positionRequest)return;notice(`${error.message}${state.positions?' Os dados exibidos são da última consulta concluída.':''}`);connection('Falha na consulta','error');if(state.positions)$('updated-at').textContent='dados anteriores · falha ao atualizar';}
    finally{if(current(epoch)&&serial===state.positionRequest){button.classList.remove('loading');button.disabled=false;state.positionAbort=null;}}
  }
  async function connectLive(){
    const epoch=state.epoch;connection('Conectando à API');
    try{await request('/api/status');if(!current(epoch))return;connection('API conectada','live');await loadPositions();}
    catch(error){if(error.name==='AbortError'||!current(epoch))return;connection('API indisponível','error');notice(`${error.message}\nVocê pode tentar atualizar ou escolher “Ver demonstração” para conhecer a interface.`);}
  }
  function changeMode(){
    state.epoch++;controllers.forEach(controller=>controller.abort());state.positionAbort?.abort();state.positionRequest++;
    state.mode=state.mode==='live'?'demo':'live';state.line=null;state.positions=null;state.vehicles=[];state.corridors=null;state.stops=[];state.hasFitted=false;state.explorerData=null;state.positionAbort=null;
    state.markers?.clearLayers();state.stopMarkers?.clearLayers();$('line-selection').hidden=true;$('line-results').hidden=true;$('arrival-panel').hidden=true;$('demo-banner').hidden=state.mode!=='demo';$('mode-button').textContent=state.mode==='demo'?'Usar API real':'Ver demonstração';
    $('stop-results').replaceChildren(emptyState('Pesquise uma parada.','Você também pode selecionar as paradas de uma linha ou corredor.','pin'));
    $('corridor-results').replaceChildren();$('explorer-output').textContent='A resposta da consulta aparecerá aqui.';$('explorer-path').textContent='Selecione um recurso e consulte.';$('export-explorer').disabled=true;
    $('auto-refresh').checked=false;$('refresh-positions').classList.remove('loading');$('refresh-positions').disabled=false;
    renderPositions(null);['stat-vehicles','stat-lines','stat-accessible','stat-time'].forEach(id=>$(id).textContent='—');$('updated-at').textContent='aguardando consulta';$('positions-description').textContent='As posições aparecem após uma consulta.';$('export-csv').disabled=true;$('export-json').disabled=true;notice('');
    showView('monitor');if(state.mode==='demo')loadPositions();else connectLive();
  }
  function chooseLine(line){state.line=line;state.hasFitted=false;clearPositionDisplay();$('line-selection-text').textContent=`${lineCode(line)} · ${lineDescription(line)} · sentido ${line.sl} · código ${line.cl}`;$('line-selection').hidden=false;$('line-results').hidden=true;loadPositions();}
  async function searchLines(event){
    event.preventDefault();const query=$('line-search').value.trim();if(!query)return;const epoch=state.epoch;const serial=++state.lineRequest;const button=event.submitter;button.disabled=true;
    try{const data=await request(pathFor('linhas',{q:query}));if(!current(epoch)||serial!==state.lineRequest)return;notice('');const fragment=document.createDocumentFragment();(data||[]).forEach(line=>{const button=document.createElement('button');button.type='button';button.className='result-button';const label=text('span',lineDescription(line));label.append(text('small',`Sentido ${line.sl} · código interno ${line.cl}${line.lc?' · circular':''}`));button.append(text('span',lineCode(line),'line-label'),label,svg('arrow'));button.addEventListener('click',()=>chooseLine(line));fragment.append(button);});if(!data?.length)fragment.append(text('p','Nenhuma linha encontrada. Tente outro número ou nome.','result-message'));$('line-results').replaceChildren(fragment);$('line-results').hidden=false;}
    catch(error){if(current(epoch)&&serial===state.lineRequest&&error.name!=='AbortError')notice(error.message);}finally{button.disabled=false;}
  }
  function emptyState(title,description,icon='pin'){const div=document.createElement('div');div.className='empty-state';div.append(svg(icon),text('h3',title),text('p',description));return div;}
  function renderStops(stops){
    state.stops=Array.isArray(stops)?stops:[];const fragment=document.createDocumentFragment();
    state.stops.forEach(stop=>{const card=document.createElement('article');card.className='stop-card';card.append(svg('pin'),text('h3',stop.np),text('p',stop.ed||'Endereço não informado'),text('small',`Código ${stop.cp} · ${stop.py??'—'}, ${stop.px??'—'}`));const button=text('button','Ver previsões de chegada →','text-button');button.type='button';button.addEventListener('click',()=>loadArrivals(stop));card.append(button);fragment.append(card);});
    if(!state.stops.length)fragment.append(emptyState('Nenhuma parada retornada.','Tente outro termo. A API pode não ter paradas cadastradas para a linha ou corredor.'));
    $('stop-results').replaceChildren(fragment);
  }
  async function loadStops(params,context){
    const epoch=state.epoch;const serial=++state.stopRequest;state.arrivalRequest++;showView('stops');$('stops-context').textContent=context;$('arrival-panel').hidden=true;$('stop-results').replaceChildren(text('p','Consultando paradas…','muted'));
    try{const data=await request(pathFor('paradas',params));if(!current(epoch)||serial!==state.stopRequest)return;notice('');renderStops(data);}
    catch(error){if(!current(epoch)||serial!==state.stopRequest||error.name==='AbortError')return;notice(error.message);$('stop-results').replaceChildren(emptyState('A consulta não foi concluída.','Tente pesquisar novamente.'));}
  }
  async function loadArrivals(stop){
    const epoch=state.epoch;const serial=++state.arrivalRequest;$('arrival-panel').hidden=false;$('arrival-title').textContent=stop.np;$('arrival-reference').textContent=`Código da parada ${stop.cp}`;$('arrival-content').replaceChildren(text('p','Consultando previsões…','result-message'));$('arrival-panel').scrollIntoView({behavior:'smooth',block:'start'});$('arrival-panel').focus({preventScroll:true});
    try{const data=await request(pathFor('previsoes',{codigo_parada:stop.cp}));if(!current(epoch)||serial!==state.arrivalRequest)return;notice('');$('arrival-reference').textContent=`Código ${stop.cp} · referência da API: ${data?.hr||'não informada'}${state.mode==='demo'?' · horários fictícios':''}`;
      const list=document.createElement('div');list.className='arrival-list';let count=0;
      (data?.p?.l||[]).forEach(line=>(line.vs||[]).forEach(bus=>{count++;const item=document.createElement('article');item.className='arrival-item';item.append(text('span',line.c,'line-label'),text('strong',bus.t||'—'),text('p',`Destino: ${line.lt0||'Não informado'}`),text('small',`Veículo ${bus.p} · ${bus.a===true?'acessível':bus.a===false?'sem indicação de acessibilidade':'acessibilidade não informada'}`));list.append(item);}));
      $('arrival-content').replaceChildren(count?list:emptyState('Sem previsões neste momento.','A API não retornou estimativas para esta parada.','clock'));
      if(state.map&&validCoordinates(stop)){state.stopMarkers.clearLayers();const popup=text('strong',stop.np);L.marker([stop.py,stop.px],{icon:L.divIcon({className:'stop-marker',iconSize:[18,18]}),title:stop.np}).bindPopup(popup).addTo(state.stopMarkers);}
    }catch(error){if(!current(epoch)||serial!==state.arrivalRequest||error.name==='AbortError')return;notice(error.message);$('arrival-content').replaceChildren(emptyState('Não foi possível consultar as previsões.','Tente novamente em instantes.','clock'));}
  }
  async function loadCorridors(){
    const epoch=state.epoch;$('corridor-results').replaceChildren(text('p','Consultando corredores…','muted'));
    try{const data=await request('/api/corredores');if(!current(epoch))return;notice('');state.corridors=Array.isArray(data)?data:[];const fragment=document.createDocumentFragment();state.corridors.forEach(corridor=>{const card=document.createElement('article');card.className='corridor-card';card.append(text('span',`CORREDOR ${corridor.cc}`,'corridor-number'),text('h3',corridor.nc));const button=text('button','Explorar paradas →','text-button');button.type='button';button.addEventListener('click',()=>loadStops({codigo_corredor:corridor.cc},`Paradas do corredor ${corridor.nc} · código ${corridor.cc}`));card.append(button);fragment.append(card);});if(!state.corridors.length)fragment.append(emptyState('Nenhum corredor retornado.','Tente consultar novamente mais tarde.','route'));$('corridor-results').replaceChildren(fragment);}
    catch(error){if(!current(epoch)||error.name==='AbortError')return;notice(error.message);$('corridor-results').replaceChildren(emptyState('Corredores indisponíveis.','Use o botão acima para tentar novamente.','route'));}
  }
  const explorerDefinitions={
    positions:{path:'posicoes',fields:[['codigo_linha','Código interno da linha (opcional)','1273','number']]},
    lines:{path:'linhas',fields:[['q','Número ou nome da linha','8000','search',true],['sentido','Sentido (opcional)','','select',false,[['','Todos'],['1','1 — principal → secundário'],['2','2 — secundário → principal']]]]},
    stops:{path:'paradas',fields:[['q','Nome ou endereço da parada','Afonso','search',true]]},
    arrivals:{path:'previsoes',fields:[['codigo_parada','Código da parada (informe um código)','340015329','number'],['codigo_linha','Código interno da linha (opcional)','1273','number']]},
    corridors:{path:'corredores',fields:[]},companies:{path:'empresas',fields:[]},
    garages:{path:'garagens',fields:[['codigo_empresa','Código da empresa','101','number',true],['codigo_linha','Código da linha (opcional)','1273','number']]},
    speed:{path:'velocidades',fields:[['tipo','Grupo de vias','','select',false,[['geral','Todas as vias'],['corredor','Corredores'],['outras','Outras vias']]],['sentido','Sentido das vias','','select',false,[['','Ambos os sentidos'],['BC','Bairro → centro (BC)'],['CB','Centro → bairro (CB)']]]]}
  };
  function renderExplorerFields(){
    const definition=explorerDefinitions[$('explorer-resource').value];const fragment=document.createDocumentFragment();
    definition.fields.forEach(([name,label,placeholder,type,required,options])=>{const div=document.createElement('div');div.className='field';const input=document.createElement(type==='select'?'select':'input');input.id=`explorer-${name}`;input.name=name;input.required=!!required;if(type==='select')options.forEach(([value,label])=>{const option=text('option',label);option.value=value;input.append(option);});else{input.type=type;input.placeholder=placeholder;if(type==='number'){input.min=name==='codigo_empresa'?'0':'1';input.step='1';}else input.maxLength=100;}const labelNode=text('label',label);labelNode.htmlFor=input.id;div.append(labelNode,input);fragment.append(div);});$('explorer-fields').replaceChildren(fragment);
  }
  async function runExplorer(event){
    event.preventDefault();const epoch=state.epoch;const serial=++state.explorerRequest;const resource=$('explorer-resource').value;const definition=explorerDefinitions[resource];const params=Object.fromEntries(new FormData(event.currentTarget));const path=pathFor(definition.path,params);$('explorer-path').textContent=`GET ${path}`;
    if(resource==='arrivals'&&!params.codigo_parada&&!params.codigo_linha){notice('Informe pelo menos o código de uma parada ou o código interno de uma linha.');return;}
    if(resource==='speed'){
      state.explorerData=null;$('export-explorer').disabled=true;
      if(state.mode==='demo'){$('explorer-output').textContent='As velocidades são fornecidas como arquivo KMZ. O modo demonstração não gera arquivos de velocidades. Selecione “Usar API real” para consultar este recurso.';return;}
      notice('');$('explorer-output').textContent='A SPTrans disponibiliza velocidades em um arquivo KMZ (mapa compactado). Use o link abaixo para baixar o arquivo e abri-lo em um visualizador compatível, como o Google Earth.';
      const download=text('a','Baixar velocidades (.kmz) →','button primary');download.href=path;download.download='velocidades.kmz';download.target='_blank';download.rel='noopener noreferrer';$('explorer-output').append(document.createTextNode('\n\n'));$('explorer-output').append(download);return;
    }
    const button=event.submitter;button.disabled=true;$('explorer-output').textContent='Consultando…';$('export-explorer').disabled=true;
    try{const data=await request(path);if(!current(epoch)||serial!==state.explorerRequest)return;notice('');state.explorerData=data;$('explorer-output').textContent=JSON.stringify(data,null,2);$('export-explorer').disabled=false;}
    catch(error){if(!current(epoch)||serial!==state.explorerRequest||error.name==='AbortError')return;notice(error.message);$('explorer-output').textContent='Não foi possível concluir esta consulta.';state.explorerData=null;}
    finally{button.disabled=false;}
  }
  function download(content,filename,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  // O apóstrofo impede que valores externos sejam interpretados como fórmulas.
  function csvCell(value){let string=String(value??'');if(/^[\s]*[=+\-@]/.test(string)&&typeof value!=='number')string="'"+string;return '"'+string.replace(/"/g,'""')+'"';}
  function exportCsv(){const fields=['linha','codigo_linha','sentido','origem','destino','p','a','ta','py','px'];const header=['Linha','Código interno','Sentido','Origem','Destino','Veículo','Acessível','Captura (UTC)','Latitude','Longitude'];const rows=[header,...state.vehicles.map(bus=>fields.map(field=>field==='a'?(bus.a===true?'Sim':bus.a===false?'Não':''):bus[field]))];download('\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n'),`sptrans-veiculos${state.mode==='demo'?'-demonstracao':''}.csv`,'text/csv;charset=utf-8');}
  function toggleTable(show){$('map-wrapper').hidden=show;$('vehicle-table-wrapper').hidden=!show;$('show-table').classList.toggle('active',show);$('show-map').classList.toggle('active',!show);$('show-table').setAttribute('aria-pressed',String(show));$('show-map').setAttribute('aria-pressed',String(!show));if(!show)setTimeout(()=>state.map?.invalidateSize(),0);}

  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));
  $('mode-button').addEventListener('click',changeMode);$('line-search-form').addEventListener('submit',searchLines);$('refresh-positions').addEventListener('click',loadPositions);
  $('all-lines').addEventListener('click',()=>{state.line=null;state.hasFitted=false;clearPositionDisplay();$('line-selection').hidden=true;$('line-results').hidden=true;loadPositions();});
  $('selected-line-stops').addEventListener('click',()=>{if(state.line)loadStops({codigo_linha:state.line.cl},`Paradas da linha ${lineCode(state.line)} · sentido ${state.line.sl} · código ${state.line.cl}`);});
  $('stop-search-form').addEventListener('submit',event=>{event.preventDefault();const q=$('stop-search').value.trim();if(q)loadStops({q},`Resultado da busca por “${q}”`);});
  $('refresh-corridors').addEventListener('click',loadCorridors);$('close-arrivals').addEventListener('click',()=>{state.arrivalRequest++;$('arrival-panel').hidden=true;});
  $('show-table').addEventListener('click',()=>toggleTable(true));$('show-map').addEventListener('click',()=>toggleTable(false));$('fallback-table').addEventListener('click',()=>toggleTable(true));
  $('export-csv').addEventListener('click',exportCsv);$('export-json').addEventListener('click',()=>download(JSON.stringify({modo:state.mode,demonstracao:state.mode==='demo',linha:state.line,resposta:state.positions},null,2),'sptrans-posicoes.json','application/json'));
  $('explorer-resource').addEventListener('change',renderExplorerFields);$('explorer-form').addEventListener('submit',runExplorer);$('export-explorer').addEventListener('click',()=>download(JSON.stringify({modo:state.mode,demonstracao:state.mode==='demo',resposta:state.explorerData},null,2),'sptrans-consulta.json','application/json'));
  setInterval(()=>{if($('auto-refresh').checked&&!document.hidden&&state.view==='monitor'&&!state.positionAbort)loadPositions();},30000);
  initializeMap();renderExplorerFields();connectLive();
})();
