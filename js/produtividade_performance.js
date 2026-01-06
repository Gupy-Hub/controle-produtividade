const Perf = {
    initialized: false,
    init: async function() {
        if (!Sistema.Dados.inicializado) await Sistema.Dados.inicializar();
        this.carregarRanking();
    },
    limparSelecao: function() { this.carregarRanking(); },

    carregarRanking: async function() {
        const tbody = document.getElementById('perf-ranking-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Calculando...</td></tr>';

        const tipoPeriodo = document.getElementById('perf-period-type').value; 
        const globalInput = document.getElementById('global-date');
        const dataGlobal = (globalInput && globalInput.value) ? globalInput.value : new Date().toISOString().split('T')[0];
        
        let d;
        try { d = new Date(dataGlobal + 'T12:00:00'); if (isNaN(d.getTime())) throw new Error("Data inválida"); } catch(e) { d = new Date(); }

        let inicio, fim, label;
        const ano = d.getFullYear(); const mes = d.getMonth();

        if (tipoPeriodo === 'mes') { inicio = new Date(ano, mes, 1); fim = new Date(ano, mes + 1, 0); label = `Mês: ${inicio.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`; } 
        else if (tipoPeriodo === 'trimestre') { const tri = Math.floor(mes / 3); inicio = new Date(ano, tri * 3, 1); fim = new Date(ano, (tri + 1) * 3, 0); label = `${tri + 1}º Trimestre de ${ano}`; } 
        else if (tipoPeriodo === 'semestre') { const sem = mes < 6 ? 0 : 1; inicio = new Date(ano, sem * 6, 1); fim = new Date(ano, (sem + 1) * 6, 0); label = `${sem + 1}º Semestre de ${ano}`; } 
        else { inicio = new Date(ano, 0, 1); fim = new Date(ano, 11, 31); label = `Ano de ${ano}`; }

        const sInicio = inicio.toISOString().split('T')[0];
        const sFim = fim.toISOString().split('T')[0];
        const lbl = document.getElementById('perf-range-label'); if(lbl) lbl.innerText = label;

        if (!window._supabase) return;

        const { data: rawData } = await _supabase.from('producao').select('usuario_id, data_referencia, quantidade').gte('data_referencia', sInicio).lte('data_referencia', sFim);

        const stats = {};
        const diasSet = new Set();

        if (rawData) {
            rawData.forEach(r => {
                diasSet.add(r.data_referencia);
                const u = Sistema.Dados.usuariosCache[r.usuario_id];
                if (u && (u.funcao === 'Assistente' || u.funcao === 'Auditora' || u.funcao === 'Gestora')) {
                    if (!stats[u.nome]) { stats[u.nome] = { nome: u.nome, total: 0, dias: new Set(), funcao: u.funcao, contrato: u.contrato }; }
                    stats[u.nome].total += (Number(r.quantidade) || 0);
                    stats[u.nome].dias.add(r.data_referencia);
                }
            });
        }

        const ranking = Object.values(stats).sort((a, b) => b.total - a.total);

        if (tbody) {
            tbody.innerHTML = '';
            if (ranking.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400">Sem dados no período.</td></tr>';
            } else {
                ranking.forEach((r, idx) => {
                    const diasTrab = r.dias.size;
                    const media = diasTrab > 0 ? Math.round(r.total / diasTrab) : 0;
                    const meta = diasTrab * 650;
                    const pct = meta > 0 ? Math.round((r.total / meta) * 100) : 0;
                    let badgeColor = pct >= 100 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50';

                    tbody.innerHTML += `<tr class="hover:bg-slate-50 border-b border-slate-100 last:border-0 transition text-xs"><td class="px-6 py-4 font-bold text-slate-400">#${idx + 1}</td><td class="px-6 py-4 font-bold text-slate-700">${r.nome} <span class="text-[10px] text-slate-400 font-normal ml-1">(${r.funcao})</span></td><td class="px-6 py-4 text-center font-black text-blue-700">${r.total.toLocaleString()}</td><td class="px-6 py-4 text-center text-slate-500">${diasTrab}</td><td class="px-6 py-4 text-center font-bold text-slate-600">${media.toLocaleString()}</td><td class="px-6 py-4 text-center text-slate-400 text-xs">${meta.toLocaleString()}</td><td class="px-6 py-4 text-center"><span class="${badgeColor} px-2 py-1 rounded text-xs font-black">${pct}%</span></td></tr>`;
                });
            }
        }
        
        const clt = ranking.filter(r => r.contrato === 'CLT');
        const pj = ranking.filter(r => r.contrato === 'PJ');
        const totP = clt.length + pj.length;
        
        if (totP > 0) {
            document.getElementById('perf-pct-clt').innerText = Math.round((clt.length/totP)*100)+'%';
            document.getElementById('perf-pct-pj').innerText = Math.round((pj.length/totP)*100)+'%';
        }
        document.getElementById('perf-count-clt').innerText = clt.length;
        document.getElementById('perf-count-pj').innerText = pj.length;

        const diasUteisPeriodo = diasSet.size;
        document.getElementById('perf-card-dias').innerText = diasUteisPeriodo;

        const totalGeral = ranking.reduce((a,b)=>a+b.total,0);
        document.getElementById('perf-card-total').innerText = totalGeral.toLocaleString();
        
        // Meta Total baseada na soma das metas individuais (dias trabalhados * 650)
        const metaGeral = ranking.reduce((acc, curr) => acc + (curr.dias.size * 650), 0);
        document.getElementById('perf-label-meta-total').innerText = metaGeral.toLocaleString();

        // Média Time (Todas) = Produção Total / Dias Úteis do Período
        const mediaTodas = diasUteisPeriodo > 0 ? Math.round(totalGeral / diasUteisPeriodo) : 0;
        document.getElementById('perf-media-todas').innerText = mediaTodas.toLocaleString();

        // Média Individual = Média Time / Quantidade de Pessoas (ranking.length)
        const mediaInd = ranking.length > 0 ? Math.round(mediaTodas / ranking.length) : 0;
        document.getElementById('perf-media-assist').innerText = mediaInd.toLocaleString();

        const pctGeral = metaGeral > 0 ? Math.round((totalGeral / metaGeral) * 100) : 0;
        document.getElementById('perf-txt-pct').innerText = pctGeral + '%';
        
        const cardPct = document.getElementById('perf-card-pct');
        const iconPct = document.getElementById('perf-icon-pct');
        if (cardPct) {
            cardPct.classList.remove('from-indigo-600', 'to-blue-700', 'from-red-600', 'to-rose-700', 'shadow-blue-200', 'shadow-rose-200');
            if (pctGeral < 100) {
                cardPct.classList.add('from-red-600', 'to-rose-700', 'shadow-rose-200');
                if(iconPct) iconPct.innerHTML = '<i class="fas fa-times-circle text-xl text-white/50"></i>';
            } else {
                cardPct.classList.add('from-indigo-600', 'to-blue-700', 'shadow-blue-200');
                if(iconPct) iconPct.innerHTML = '<i class="fas fa-check-circle text-xl text-white/50"></i>';
            }
        }
    }
};