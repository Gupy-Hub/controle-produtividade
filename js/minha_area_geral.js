const sessao = JSON.parse(localStorage.getItem('usuario'));
const isMgr = sessao ? sessao.funcao === 'Gestora' : false;

let myChart = null;
let usersMap = {}; 
let userRoles = {};
let nameToIdsMap = {}; 

document.addEventListener('DOMContentLoaded', async () => {
    // Tenta obter a data global (se o objeto DataGlobal existir no layout.js)
    // Caso contrário, usa a data de hoje.
    let dataSalva = new Date().toISOString().split('T')[0].split('-').reverse().join('/');
    
    if (typeof DataGlobal !== 'undefined') {
        dataSalva = DataGlobal.obter();
    } else {
        // Fallback simples se DataGlobal não estiver carregado
        const stored = localStorage.getItem('data_sistema_global');
        if (stored) dataSalva = stored.split('-').reverse().join('/');
    }

    const inputData = document.getElementById('filtro-data-manual');
    if (inputData) inputData.value = dataSalva;

    await carregarUsuarios(); 

    if (isMgr) {
        const containerFiltro = document.getElementById('container-filtro-user');
        const avisoEdicao = document.getElementById('aviso-edicao');
        if(containerFiltro) containerFiltro.classList.remove('hidden');
        if(avisoEdicao) avisoEdicao.classList.remove('hidden');
    }

    atualizarDashboard();
});

function verificarEnter(e) { if(e.key === 'Enter') aplicarDataManual(); }

function aplicarDataManual() { 
    const val = document.getElementById('filtro-data-manual').value;
    if(val.length === 10) {
        if (typeof DataGlobal !== 'undefined') {
            DataGlobal.definir(val);
        } else {
            // Fallback: Salva no formato ISO YYYY-MM-DD para compatibilidade
            const parts = val.split('/');
            localStorage.setItem('data_sistema_global', `${parts[2]}-${parts[1]}-${parts[0]}`);
        }
        atualizarDashboard(); 
    }
}

function getDateFromInput() {
    const val = document.getElementById('filtro-data-manual').value;
    const parts = val.split('/');
    return new Date(parts[2], parts[1]-1, parts[0]);
}

// Máscara para o input de data (DD/MM/AAAA)
function mascaraDataGlobal(input) {
    let v = input.value.replace(/\D/g, "");
    if (v.length > 8) v = v.substring(0, 8);
    if (v.length >= 5) {
        input.value = v.substring(0, 2) + "/" + v.substring(2, 4) + "/" + v.substring(4);
    } else if (v.length >= 3) {
        input.value = v.substring(0, 2) + "/" + v.substring(2);
    } else {
        input.value = v;
    }
}

async function carregarUsuarios() {
    if (!window._supabase) return;
    
    const { data } = await _supabase.from('usuarios').select('id, nome, funcao').order('nome');
    if(data) {
        const selectFiltro = document.getElementById('filtro-user');
        const selectFeedback = document.getElementById('feedback-destinatario');
        
        data.forEach(u => {
            usersMap[u.id] = u.nome;
            userRoles[u.id] = u.funcao; 

            if(!nameToIdsMap[u.nome]) nameToIdsMap[u.nome] = [];
            nameToIdsMap[u.nome].push(u.id);

            if(nameToIdsMap[u.nome][0] === u.id) {
                // Preenche filtro de Gestora
                if(u.funcao === 'Assistente' && selectFiltro) {
                    const opt = document.createElement('option');
                    opt.value = u.id; opt.text = u.nome;
                    selectFiltro.appendChild(opt);
                }
                // Preenche lista de Feedback (exceto eu mesmo)
                if(u.id !== sessao.id && selectFeedback) {
                    const optF = document.createElement('option');
                    optF.value = u.id; optF.text = `👤 ${u.nome}`;
                    selectFeedback.appendChild(optF);
                }
            }
        });
    }
}

function normalizarDadosPorNome(rawData) {
    const agrupado = {};
    rawData.forEach(item => {
        if (userRoles[item.usuario_id] !== 'Assistente') return;
        const nome = usersMap[item.usuario_id] || 'Desconhecido';
        const data = item.data_referencia;
        
        if (!agrupado[data]) agrupado[data] = {};
        if (!agrupado[data][nome]) {
            agrupado[data][nome] = {
                id_ref: item.id, 
                quantidade: 0, 
                meta_diaria: item.meta_diaria || 650,
                observacao: item.observacao || '', 
                observacao_gestora: item.observacao_gestora || ''
            };
        }
        
        agrupado[data][nome].quantidade += item.quantidade;
        
        // Concatena observações se forem diferentes
        if (item.observacao && !agrupado[data][nome].observacao.includes(item.observacao)) {
            agrupado[data][nome].observacao += ` | ${item.observacao}`;
        }
    });
    return agrupado;
}

async function atualizarDashboard() {
    const refDate = getDateFromInput();
    if (isNaN(refDate.getTime())) return;

    const ano = refDate.getFullYear();
    const mes = refDate.getMonth();
    const dataInicio = new Date(ano, mes, 1).toISOString().split('T')[0];
    const dataFim = new Date(ano, mes + 1, 0).toISOString().split('T')[0];

    let targetName = usersMap[sessao.id];
    let viewingTime = false;
    let isGestoraViewSelf = false;

    if (isMgr) {
        const val = document.getElementById('filtro-user').value;
        if (val === 'time') viewingTime = true;
        else if (val === 'me') isGestoraViewSelf = true;
        else targetName = usersMap[val];
    }

    // Se Gestora selecionar "Minha Visão", mostra tela de aviso e apenas feedbacks
    if (isGestoraViewSelf) {
        document.getElementById('conteudo-principal').classList.add('hidden');
        document.getElementById('aviso-gestora-view').classList.remove('hidden');
        carregarFeedbacks(); 
        return;
    } else {
        document.getElementById('conteudo-principal').classList.remove('hidden');
        document.getElementById('aviso-gestora-view').classList.add('hidden');
    }

    const { data: rawData } = await _supabase.from('producao')
        .select('*')
        .gte('data_referencia', dataInicio)
        .lte('data_referencia', dataFim);

    const dadosNormalizados = normalizarDadosPorNome(rawData || []);
    let dadosFinais = [];

    if (viewingTime) {
        // Visão de Time: Média de todas as assistentes por dia
        Object.keys(dadosNormalizados).sort().forEach(dia => {
            const prods = Object.values(dadosNormalizados[dia]);
            const total = prods.reduce((a, b) => a + b.quantidade, 0);
            const headcount = prods.length;
            dadosFinais.push({
                data_referencia: dia, 
                quantidade: headcount ? Math.round(total / headcount) : 0,
                meta_diaria: 650, 
                observacao: `Média de ${headcount} assistentes`
            });
        });
    } else {
        // Visão Individual
        Object.keys(dadosNormalizados).sort().forEach(dia => {
            const dPessoa = dadosNormalizados[dia][targetName];
            if (dPessoa) {
                dadosFinais.push({
                    id: dPessoa.id_ref, 
                    data_referencia: dia, 
                    quantidade: dPessoa.quantidade,
                    meta_diaria: dPessoa.meta_diaria, 
                    observacao: dPessoa.observacao, 
                    observacao_gestora: dPessoa.observacao_gestora
                });
            }
        });
    }

    atualizarKPIs(dadosFinais);
    atualizarTabelaDiaria(dadosFinais, viewingTime);
    
    // Atualiza gráficos se a aba estiver visível
    if (!document.getElementById('tab-evolucao').classList.contains('hidden')) {
        const btnAtivo = document.querySelector('.btn-chart.active');
        const periodo = btnAtivo ? (btnAtivo.id.replace('chart-btn-', '')) : 'mes';
        renderizarGraficos(periodo);
    }
    
    atualizarComparativoRapido(dadosFinais, viewingTime, targetName, dataInicio, dataFim);
    carregarFeedbacks(); 
}

function atualizarKPIs(dados) {
    const total = dados.reduce((acc, curr) => acc + (curr.quantidade || 0), 0);
    const diasTrabalhados = dados.filter(d => d.quantidade > 0).length || 1; 
    
    let metaTotal = 0;
    if(dados.length > 0) dados.forEach(d => metaTotal += (d.meta_diaria || 650)); 
    else metaTotal = 650 * 22; // Estimativa se vazio

    const media = Math.round(total / diasTrabalhados);
    const atingimento = metaTotal > 0 ? Math.round((total / metaTotal) * 100) : 0;

    document.getElementById('kpi-total').innerText = total.toLocaleString();
    document.getElementById('kpi-meta-total').innerText = metaTotal.toLocaleString();
    document.getElementById('kpi-porcentagem').innerText = atingimento + '%';
    document.getElementById('kpi-media-real').innerText = media.toLocaleString();
    document.getElementById('bar-progress').style.width = Math.min(atingimento, 100) + '%';
    
    const bar = document.getElementById('bar-progress');
    const icon = document.getElementById('icon-status');
    
    if(atingimento >= 100) { 
        bar.className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full"; 
        icon.className="fas fa-check-circle text-emerald-500"; 
    }
    else if(atingimento >= 80) { 
        bar.className="bg-gradient-to-r from-yellow-400 to-orange-400 h-full rounded-full"; 
        icon.className="fas fa-exclamation-circle text-yellow-500"; 
    }
    else { 
        bar.className="bg-gradient-to-r from-red-500 to-rose-600 h-full rounded-full"; 
        icon.className="fas fa-times-circle text-red-500"; 
    }
}

function atualizarTabelaDiaria(dados, viewingTime) {
    const tbody = document.getElementById('tabela-diario');
    if (!dados.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400">Nenhum registo encontrado.</td></tr>'; return; }
    
    let html = '';
    
    // Ordenar decrescente por data
    dados.sort((a,b) => b.data_referencia.localeCompare(a.data_referencia));

    dados.forEach(item => {
        const meta = item.meta_diaria || 650; 
        const atingiu = item.quantidade >= meta;
        const badge = atingiu ? '<span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold uppercase">Meta Batida</span>' : '<span class="bg-rose-100 text-rose-700 px-2 py-1 rounded text-xs font-bold uppercase">Abaixo</span>';
        const dFmt = item.data_referencia.split('-').reverse().join('/');
        
        let inputMeta = `<span class="font-bold text-slate-600">${meta}</span>`;
        if(isMgr && !viewingTime && item.id) {
            inputMeta = `<input type="number" value="${meta}" onchange="atualizarMeta(${item.id}, this.value, ${meta})" class="w-20 text-center border border-slate-200 rounded px-1 py-1 text-xs font-bold bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-blue-200">`;
        }
        
        let obs = item.observacao || '<span class="text-slate-300">-</span>';
        if(item.observacao_gestora) {
            obs += `<div class="mt-1 text-[10px] text-blue-600 bg-blue-50 p-1.5 rounded border border-blue-100"><i class="fas fa-user-shield mr-1"></i>${item.observacao_gestora}</div>`;
        }
        
        html += `<tr class="hover:bg-slate-50 border-b border-slate-50 transition"><td class="px-6 py-4 font-bold text-slate-600">${dFmt}</td><td class="px-6 py-4 text-center font-black text-blue-600 text-lg">${item.quantidade}</td><td class="px-6 py-4 text-center">${inputMeta}</td><td class="px-6 py-4 text-center">${badge}</td><td class="px-6 py-4 text-xs text-slate-500 max-w-xs break-words">${obs}</td></tr>`;
    });
    tbody.innerHTML = html;
}

async function atualizarMeta(id, nv, av) { 
    if(nv == av) return; 
    const m = prompt("Motivo da alteração de meta:"); 
    if(!m) { atualizarDashboard(); return; } 
    
    const obs = `${new Date().toLocaleDateString()} - Alterado ${av}->${nv}: ${m}`; 
    await _supabase.from('producao').update({ meta_diaria: nv, observacao_gestora: obs }).eq('id', id); 
    atualizarDashboard(); 
}

async function renderizarGraficos(periodo) {
    document.querySelectorAll('.btn-chart').forEach(b => b.classList.remove('active'));
    document.getElementById(`chart-btn-${periodo}`).classList.add('active');

    const refDate = getDateFromInput();
    const ano = refDate.getFullYear();
    const mes = refDate.getMonth();
    let dInicio, dFim;

    if (periodo === 'mes') {
        dInicio = new Date(ano, mes, 1).toISOString().split('T')[0];
        dFim = new Date(ano, mes + 1, 0).toISOString().split('T')[0];
    } else if (periodo === 'trimestre') {
        const trimStart = Math.floor(mes / 3) * 3;
        dInicio = new Date(ano, trimStart, 1).toISOString().split('T')[0];
        dFim = new Date(ano, trimStart + 3, 0).toISOString().split('T')[0];
    } else if (periodo === 'semestre') {
        const semStart = mes < 6 ? 0 : 6;
        dInicio = new Date(ano, semStart, 1).toISOString().split('T')[0];
        dFim = new Date(ano, semStart + 6, 0).toISOString().split('T')[0];
    } else if (periodo === 'ano') {
        dInicio = `${ano}-01-01`;
        dFim = `${ano}-12-31`;
    }

    let targetName = usersMap[sessao.id];
    let viewingTime = false;
    if(isMgr) {
        const val = document.getElementById('filtro-user').value;
        if(val === 'time') viewingTime = true; else if(val !== 'me') targetName = usersMap[val];
    }

    const { data: rawData } = await _supabase.from('producao')
        .select('*')
        .gte('data_referencia', dInicio)
        .lte('data_referencia', dFim)
        .order('data_referencia');

    const grouped = normalizarDadosPorNome(rawData || []);
    const agruparPorMes = (periodo === 'ano');

    const processedTime = {}, processedMain = {}, metaMap = {};
    
    Object.keys(grouped).sort().forEach(date => {
        let label = agruparPorMes ? date.substring(0, 7) : date;
        const prods = Object.values(grouped[date]);
        const total = prods.reduce((a,b) => a + b.quantidade, 0); 
        const count = prods.length;
        const avg = count ? Math.round(total / count) : 0;

        if(!processedTime[label]) { processedTime[label] = {sum:0, cnt:0}; processedMain[label] = 0; metaMap[label] = 0; }
        processedTime[label].sum += avg; 
        processedTime[label].cnt++;

        let valUser = 0; 
        let metaUser = 650;
        if(grouped[date][targetName]) { 
            valUser = grouped[date][targetName].quantidade; 
            metaUser = grouped[date][targetName].meta_diaria || 650; 
        }
        processedMain[label] += valUser; 
        metaMap[label] = metaUser;
    });

    const labels = Object.keys(processedTime).sort();
    const dataMain = [], dataBench = [];
    let statsDias = 0, statsBest = 0, statsBatida = 0;

    labels.forEach(k => {
        // Se agrupado por mês, processedTime[k].sum é a soma das médias diárias daquele mês?
        // Ajuste: Para gráfico anual, queremos a Média Mensal (Soma Total / Dias Úteis) ou Média das Médias?
        // Aqui mantemos a lógica simples de Média das Médias diárias para o Time.
        
        let valTime = Math.round(processedTime[k].sum / processedTime[k].cnt);
        let valMainFinal = processedMain[k];
        
        if (agruparPorMes) {
            // Se for visão anual, valMainFinal está somando o mês todo. Vamos dividir pelos dias (cnt) para ter a média mensal
            valMainFinal = Math.round(valMainFinal / processedTime[k].cnt); 
        }
        
        const displayMain = viewingTime ? valTime : valMainFinal;
        dataMain.push(displayMain);
        dataBench.push(viewingTime ? 650 : valTime);

        if(displayMain > 0) {
            statsDias++;
            if(displayMain > statsBest) statsBest = displayMain;
            if(displayMain >= 650) statsBatida++;
        }
    });

    document.getElementById('evo-dias').innerText = statsDias;
    document.getElementById('evo-label-dias').innerText = agruparPorMes ? "meses ativos" : "dias trabalhados";
    document.getElementById('evo-taxa').innerText = statsDias ? Math.round((statsBatida/statsDias)*100) + '%' : '0%';
    document.getElementById('evo-best').innerText = statsBest;

    const ctx = document.getElementById('chartPrincipal').getContext('2d');
    if(myChart) myChart.destroy();
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(37, 99, 235, 0.2)');
    gradient.addColorStop(1, 'rgba(37, 99, 235, 0)');

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(k => agruparPorMes ? k.split('-').reverse().join('/') : k.split('-').reverse().slice(0, 2).join('/')),
            datasets: [
                { label: viewingTime ? 'Média Equipa' : targetName, data: dataMain, borderColor: '#2563eb', backgroundColor: gradient, borderWidth: 3, tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#fff', pointBorderColor: '#2563eb' },
                { label: viewingTime ? 'Meta (650)' : 'Média Equipa', data: dataBench, borderColor: viewingTime ? '#10b981' : '#94a3b8', borderWidth: 2, borderDash: [6, 6], tension: 0.4, pointRadius: 0, fill: false }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            interaction: { mode: 'index', intersect: false }, 
            plugins: { 
                legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { weight: 'bold' }, padding: 20 } } 
            }, 
            scales: { 
                y: { beginAtZero: true, grid: { borderDash: [4, 4] } }, 
                x: { grid: { display: false } } 
            } 
        }
    });
}

async function atualizarComparativoRapido(dadosFinais, viewingTime, targetName, inicio, fim) {
    const cardL = document.getElementById('card-comp-left');
    const cardR = document.getElementById('card-comp-right');
    const labelL = document.getElementById('label-media-selecionada');
    const labelR = document.getElementById('label-media-benchmark');
    const valL = document.getElementById('comp-media-user');
    const valR = document.getElementById('comp-media-time');

    const { data: all } = await _supabase.from('producao').select('*').gte('data_referencia', inicio).lte('data_referencia', fim);
    const norm = normalizarDadosPorNome(all||[]);
    let sumMedias=0, cntDias=0;
    
    Object.values(norm).forEach(diaObj => {
        const arr = Object.values(diaObj);
        const tot = arr.reduce((a,b)=>a+b.quantidade,0);
        const headCount = arr.filter(p => p.quantidade > 0).length;
        if(headCount > 0) { sumMedias += (tot/headCount); cntDias++; }
    });
    
    const mediaGeral = cntDias ? Math.round(sumMedias/cntDias) : 0;
    
    const diasTrabUser = dadosFinais.filter(d => d.quantidade > 0);
    const totUser = diasTrabUser.reduce((a,b)=>a+b.quantidade,0);
    const mediaUser = diasTrabUser.length ? Math.round(totUser/diasTrabUser.length) : 0;

    valL.innerText = mediaUser;
    valR.innerText = viewingTime ? 650 : mediaGeral; 

    labelL.innerText = viewingTime ? "Média da Equipa" : `Média ${targetName}`;
    labelR.innerText = viewingTime ? "Meta Esperada" : "Média Geral da Equipa";

    if (mediaUser < 650) {
        cardL.className = "flex-1 bg-red-500 border border-red-600 rounded-3xl p-8 text-center shadow-lg relative overflow-hidden transition-colors duration-300 text-white";
        labelL.className = "block text-xs font-bold text-red-200 uppercase tracking-widest mb-4";
    } else {
        cardL.className = "flex-1 bg-gradient-to-br from-blue-600 to-indigo-700 border border-transparent rounded-3xl p-8 text-center shadow-xl relative overflow-hidden transition-colors duration-300 text-white";
        labelL.className = "block text-xs font-bold text-blue-200 uppercase tracking-widest mb-4";
    }

    const valRight = viewingTime ? 650 : mediaGeral;
    
    if (valRight < 650) {
        cardR.className = "flex-1 bg-red-50 border border-red-200 rounded-3xl p-8 text-center shadow-sm relative overflow-hidden transition-colors duration-300";
        labelR.className = "block text-xs font-bold text-red-400 uppercase tracking-widest mb-4";
        valR.className = "text-6xl font-black text-red-600 tracking-tighter mb-2";
    } else {
        cardR.className = "flex-1 bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-sm relative overflow-hidden transition-colors duration-300";
        labelR.className = "block text-xs font-bold text-slate-400 uppercase tracking-widest mb-4";
        valR.className = "text-6xl font-black text-slate-700 tracking-tighter mb-2";
    }

    const diff = mediaUser - valRight;
    const elMsg = document.getElementById('comp-mensagem');
    
    if (diff > 0) elMsg.innerHTML = `<span class="text-emerald-600 font-black text-xl">+${diff}</span> <span class="text-slate-400 text-sm font-normal">acima do esperado</span>`;
    else if (diff < 0) elMsg.innerHTML = `<span class="text-rose-500 font-black text-xl">${diff}</span> <span class="text-slate-400 text-sm font-normal">abaixo do esperado</span>`;
    else elMsg.innerHTML = `<span class="text-slate-500">Exatamente na média.</span>`;
}

function mudarAba(aba) {
    document.querySelectorAll('.view-tab').forEach(el => el.classList.add('hidden')); 
    document.querySelectorAll('.btn-tab').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`tab-${aba}`).classList.remove('hidden'); 
    document.getElementById(`btn-${aba}`).classList.add('active');
    
    if(aba === 'evolucao') renderizarGraficos('mes');
}

async function carregarFeedbacks() {
    const el = document.getElementById('lista-feedbacks');
    const { data } = await _supabase.from('feedbacks').select('*').order('created_at', {ascending:true});
    
    if(!data || !data.length) { 
        el.innerHTML = '<div class="text-center text-slate-300 py-12">Nenhum feedback encontrado.</div>'; 
        return; 
    }
    
    let html='';
    data.forEach(m => {
        const isPub = m.usuario_alvo_id === null; 
        const isMe = m.usuario_alvo_id == sessao.id; 
        const isMine = m.autor_nome === sessao.nome;
        
        if(isPub || isMe || isMine) {
            const align = isMine ? 'ml-auto bg-blue-600 text-white rounded-tr-none' : 'mr-auto bg-white text-slate-700 border border-slate-100 rounded-tl-none';
            const subColor = isMine ? 'text-blue-200' : 'text-slate-400';
            const badge = isPub ? '📢 TIME' : (isMine && m.usuario_alvo_id ? `🔒 ${usersMap[m.usuario_alvo_id]}` : '🔒 PRIVADO');
            
            html += `<div class="max-w-[80%] p-4 rounded-2xl shadow-sm mb-4 ${align}">
                        <div class="flex justify-between items-center mb-2 text-xs font-bold uppercase tracking-wide opacity-90">
                            <span>${m.autor_nome} <span class="opacity-70 ml-1 scale-75 inline-block border border-current px-1 rounded">${badge}</span></span>
                            <span class="${subColor}">${new Date(m.created_at).toLocaleDateString()}</span>
                        </div>
                        <p class="leading-relaxed whitespace-pre-wrap font-medium">${m.mensagem}</p>
                     </div>`;
        }
    });
    el.innerHTML = html; 
    el.scrollTop = el.scrollHeight;
}

async function enviarFeedback() {
    const txt = document.getElementById('input-feedback').value; 
    const dest = document.getElementById('feedback-destinatario').value;
    
    if(!txt.trim()) return;
    
    const aid = dest !== 'time' ? parseInt(dest) : null;
    await _supabase.from('feedbacks').insert({ 
        usuario_alvo_id: aid, 
        autor_nome: sessao.nome, 
        autor_funcao: sessao.funcao, 
        mensagem: txt 
    });
    
    document.getElementById('input-feedback').value = ''; 
    carregarFeedbacks();
}