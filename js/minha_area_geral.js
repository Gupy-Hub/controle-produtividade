// Objeto Responsável pelo Gráfico de Evolução (Atualizado para ler o novo input)
const MA_Evolucao = {
    chart: null,
    
    renderizarGraficos: async function(periodo) {
        document.querySelectorAll('.chart-selector-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`chart-btn-${periodo}`).classList.add('active');

        const valData = document.getElementById('global-date').value;
        if(!valData) return;
        const [y, m, d] = valData.split('-').map(Number);
        const refDate = new Date(y, m-1, d);

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

        let targetName = MA_Main.usersMap[MA_Main.sessao.id];
        let viewingTime = false;
        if(MA_Main.isMgr) {
            const val = document.getElementById('filtro-user').value;
            if(val === 'time') viewingTime = true; else if(val !== 'me') targetName = MA_Main.usersMap[val];
        }

        const { data: rawData } = await _supabase.from('producao')
            .select('*')
            .gte('data_referencia', dInicio)
            .lte('data_referencia', dFim)
            .order('data_referencia');

        const grouped = MA_Diario.normalizarDados(rawData || []);
        const agruparPorMes = (periodo === 'ano');

        const processedTime = {}, processedMain = {};
        
        Object.keys(grouped).sort().forEach(date => {
            let label = agruparPorMes ? date.substring(0, 7) : date;
            const prods = Object.values(grouped[date]);
            const total = prods.reduce((a,b) => a + b.quantidade, 0); 
            const count = prods.length;
            const avg = count ? Math.round(total / count) : 0;

            if(!processedTime[label]) { processedTime[label] = {sum:0, cnt:0}; processedMain[label] = 0; }
            processedTime[label].sum += avg; 
            processedTime[label].cnt++;

            let valUser = 0; 
            if(grouped[date][targetName]) { valUser = grouped[date][targetName].quantidade; }
            processedMain[label] += valUser; 
        });

        const labels = Object.keys(processedTime).sort();
        const dataMain = [], dataBench = [];
        let statsDias = 0, statsBest = 0, statsBatida = 0;

        labels.forEach(k => {
            let valTime = Math.round(processedTime[k].sum / processedTime[k].cnt);
            let valMainFinal = processedMain[k];
            if (agruparPorMes) valMainFinal = Math.round(valMainFinal / processedTime[k].cnt); 
            
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
        if(this.chart) this.chart.destroy();
        
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(37, 99, 235, 0.2)');
        gradient.addColorStop(1, 'rgba(37, 99, 235, 0)');

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.map(k => agruparPorMes ? k.split('-').reverse().join('/') : k.split('-').reverse().slice(0, 2).join('/')),
                datasets: [
                    { label: viewingTime ? 'Média Equipa' : targetName, data: dataMain, borderColor: '#2563eb', backgroundColor: gradient, borderWidth: 3, tension: 0.4, fill: true },
                    { label: viewingTime ? 'Meta (650)' : 'Média Equipa', data: dataBench, borderColor: viewingTime ? '#10b981' : '#94a3b8', borderWidth: 2, borderDash: [6, 6], tension: 0.4, fill: false }
                ]
            },
            options: { 
                responsive: true, maintainAspectRatio: false, 
                plugins: { legend: { position: 'bottom' } }, 
                scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } 
            } 
        });
    }
};

// ... Restante do arquivo (MA_Diario, MA_Comparativo, MA_Feedback) continua igual ao que enviei antes ...
// Vou incluir apenas para garantir a integridade se você for copiar e colar.

const MA_Diario = {
    normalizarDados: function(rawData) {
        const agrupado = {};
        rawData.forEach(item => {
            const role = MA_Main.userRoles[item.usuario_id];
            if (role !== 'Assistente') return;
            const nome = MA_Main.usersMap[item.usuario_id] || 'Desconhecido';
            const data = item.data_referencia;
            if (!agrupado[data]) agrupado[data] = {};
            if (!agrupado[data][nome]) {
                agrupado[data][nome] = { nome: nome, id_ref: item.id, quantidade: 0, meta_diaria: item.meta_diaria || 650, observacao: item.observacao || '', observacao_gestora: item.observacao_gestora || '' };
            }
            agrupado[data][nome].quantidade += item.quantidade;
            if (item.observacao && !agrupado[data][nome].observacao.includes(item.observacao)) { agrupado[data][nome].observacao += ` | ${item.observacao}`; }
        });
        return agrupado;
    },
    atualizarKPIs: function(dados) {
        const total = dados.reduce((acc, curr) => acc + (curr.quantidade || 0), 0);
        const diasTrabalhados = dados.filter(d => d.quantidade > 0).length || 1; 
        let metaTotal = 0;
        if(dados.length > 0) dados.forEach(d => metaTotal += (d.meta_ajustada || d.meta_diaria || 650)); else metaTotal = 650 * 22;
        const media = Math.round(total / diasTrabalhados);
        const atingimento = metaTotal > 0 ? Math.round((total / metaTotal) * 100) : 0;
        document.getElementById('kpi-total').innerText = total.toLocaleString();
        document.getElementById('kpi-meta-total').innerText = metaTotal.toLocaleString();
        document.getElementById('kpi-porcentagem').innerText = atingimento + '%';
        document.getElementById('kpi-media-real').innerText = media.toLocaleString();
        document.getElementById('bar-progress').style.width = Math.min(atingimento, 100) + '%';
        const bar = document.getElementById('bar-progress'); const icon = document.getElementById('icon-status');
        if(atingimento >= 100) { bar.className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full"; icon.className="fas fa-check-circle text-emerald-500"; }
        else if(atingimento >= 80) { bar.className="bg-gradient-to-r from-yellow-400 to-orange-400 h-full rounded-full"; icon.className="fas fa-exclamation-circle text-yellow-500"; }
        else { bar.className="bg-gradient-to-r from-red-500 to-rose-600 h-full rounded-full"; icon.className="fas fa-times-circle text-red-500"; }
    },
    atualizarTabela: function(dados, viewingTime) {
        const tbody = document.getElementById('tabela-diario');
        if (!dados.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400">Nenhum registo encontrado.</td></tr>'; return; }
        let html = ''; dados.sort((a,b) => b.data_referencia.localeCompare(a.data_referencia));
        dados.forEach(item => {
            const meta = item.meta_ajustada || item.meta_diaria || 650; 
            const atingiu = item.quantidade >= meta;
            const badge = atingiu ? '<span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold uppercase">Meta Batida</span>' : '<span class="bg-rose-100 text-rose-700 px-2 py-1 rounded text-xs font-bold uppercase">Abaixo</span>';
            const dFmt = item.data_referencia.split('-').reverse().join('/');
            let inputMeta = `<span class="font-bold text-slate-600">${meta}</span>`;
            if(MA_Main.isMgr && !viewingTime && item.id) { inputMeta = `<input type="number" value="${meta}" onchange="MA_Diario.atualizarMetaBD(${item.id}, this.value, ${meta})" class="w-20 text-center border border-slate-200 rounded px-1 py-1 text-xs font-bold bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-blue-200">`; }
            let obs = item.observacao || '<span class="text-slate-300">-</span>';
            if(item.observacao_gestora) { obs += `<div class="mt-1 text-[10px] text-blue-600 bg-blue-50 p-1.5 rounded border border-blue-100"><i class="fas fa-user-shield mr-1"></i>${item.observacao_gestora}</div>`; }
            html += `<tr class="hover:bg-slate-50 border-b border-slate-50 transition"><td class="px-6 py-4 font-bold text-slate-600">${dFmt}</td><td class="px-6 py-4 text-center font-black text-blue-600 text-lg">${item.quantidade}</td><td class="px-6 py-4 text-center">${inputMeta}</td><td class="px-6 py-4 text-center">${badge}</td><td class="px-6 py-4 text-xs text-slate-500 max-w-xs break-words">${obs}</td></tr>`;
        });
        tbody.innerHTML = html;
    },
    atualizarMetaBD: async function(id, nv, av) { 
        if(nv == av) return; const m = prompt("Motivo da alteração de meta:"); if(!m) { MA_Main.atualizarDashboard(); return; } 
        const obs = `${new Date().toLocaleDateString()} - Alterado ${av}->${nv}: ${m}`; await _supabase.from('producao').update({ meta_diaria: nv, observacao_gestora: obs }).eq('id', id); MA_Main.atualizarDashboard(); 
    }
};

const MA_Comparativo = {
    atualizar: async function(dadosFinais, viewingTime, targetName, inicio, fim) {
        const valL = document.getElementById('comp-media-user');
        const valR = document.getElementById('comp-media-time');
        const elMsg = document.getElementById('comp-mensagem');
        const { data: all } = await _supabase.from('producao').select('*').gte('data_referencia', inicio).lte('data_referencia', fim);
        const norm = MA_Diario.normalizarDados(all||[]);
        let sumMedias=0, cntDias=0;
        Object.values(norm).forEach(diaObj => {
            const arr = Object.values(diaObj); const tot = arr.reduce((a,b)=>a+b.quantidade,0); const headCount = arr.filter(p => p.quantidade > 0).length;
            if(headCount > 0) { sumMedias += (tot/headCount); cntDias++; }
        });
        const mediaGeral = cntDias ? Math.round(sumMedias/cntDias) : 0;
        const diasTrabUser = dadosFinais.filter(d => d.quantidade > 0);
        const totUser = diasTrabUser.reduce((a,b)=>a+b.quantidade,0);
        const mediaUser = diasTrabUser.length ? Math.round(totUser/diasTrabUser.length) : 0;
        valL.innerText = mediaUser; valR.innerText = viewingTime ? 650 : mediaGeral; 
        document.getElementById('label-media-selecionada').innerText = viewingTime ? "Média da Equipa" : `Média ${targetName}`;
        document.getElementById('label-media-benchmark').innerText = viewingTime ? "Meta Esperada" : "Média Geral da Equipa";
        const diff = mediaUser - (viewingTime ? 650 : mediaGeral);
        if (diff > 0) elMsg.innerHTML = `<span class="text-emerald-600 font-black text-xl">+${diff}</span> <span class="text-slate-400 text-sm font-normal">acima do esperado</span>`;
        else if (diff < 0) elMsg.innerHTML = `<span class="text-rose-500 font-black text-xl">${diff}</span> <span class="text-slate-400 text-sm font-normal">abaixo do esperado</span>`;
        else elMsg.innerHTML = `<span class="text-slate-500">Exatamente na média.</span>`;
    }
};

const MA_Feedback = {
    carregar: async function() {
        const el = document.getElementById('lista-feedbacks');
        const { data } = await _supabase.from('feedbacks').select('*').order('created_at', {ascending:true});
        if(!data || !data.length) { el.innerHTML = '<div class="text-center text-slate-300 py-12">Nenhum feedback encontrado.</div>'; return; }
        let html='';
        data.forEach(m => {
            const isPub = m.usuario_alvo_id === null; const isMe = m.usuario_alvo_id == MA_Main.sessao.id; const isMine = m.autor_nome === MA_Main.sessao.nome;
            if(isPub || isMe || isMine) {
                const align = isMine ? 'ml-auto bg-blue-600 text-white rounded-tr-none' : 'mr-auto bg-white text-slate-700 border border-slate-100 rounded-tl-none';
                const subColor = isMine ? 'text-blue-200' : 'text-slate-400';
                const badge = isPub ? '📢 TIME' : (isMine && m.usuario_alvo_id ? `🔒 ${MA_Main.usersMap[m.usuario_alvo_id]}` : '🔒 PRIVADO');
                html += `<div class="max-w-[80%] p-4 rounded-2xl shadow-sm mb-4 ${align}"><div class="flex justify-between items-center mb-2 text-xs font-bold uppercase tracking-wide opacity-90"><span>${m.autor_nome} <span class="opacity-70 ml-1 scale-75 inline-block border border-current px-1 rounded">${badge}</span></span><span class="${subColor}">${new Date(m.created_at).toLocaleDateString()}</span></div><p class="leading-relaxed whitespace-pre-wrap font-medium">${m.mensagem}</p></div>`;
            }
        });
        el.innerHTML = html; el.scrollTop = el.scrollHeight;
    },
    enviar: async function() {
        const txt = document.getElementById('input-feedback').value; const dest = document.getElementById('feedback-destinatario').value;
        if(!txt.trim()) return;
        const aid = dest !== 'time' ? parseInt(dest) : null;
        await _supabase.from('feedbacks').insert({ usuario_alvo_id: aid, autor_nome: MA_Main.sessao.nome, autor_funcao: MA_Main.sessao.funcao, mensagem: txt });
        document.getElementById('input-feedback').value = ''; this.carregar();
    }
};