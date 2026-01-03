const MA_Evolucao = {
    chartInstance: null,

    renderizarGraficos: async function(periodo) {
        document.querySelectorAll('.btn-chart').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById(`chart-btn-${periodo}`);
        if(btn) btn.classList.add('active');

        const refDate = MA_Main.getDateFromInput();
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

        const { data: rawData } = await _supabase.from('producao').select('*').gte('data_referencia', dInicio).lte('data_referencia', dFim).order('data_referencia');
        const grouped = MA_Geral.normalizarDadosPorNome(rawData || []);
        const agruparPorMes = (periodo === 'ano');

        const processedTime = {}, processedMain = {}, metaMap = {};
        Object.keys(grouped).sort().forEach(date => {
            let label = agruparPorMes ? date.substring(0, 7) : date;
            const prods = Object.values(grouped[date]);
            const total = prods.reduce((a,b)=>a+b.quantidade,0); const count = prods.length;
            const avg = count ? Math.round(total/count) : 0;

            if(!processedTime[label]) { processedTime[label] = {sum:0, cnt:0}; processedMain[label] = 0; metaMap[label] = 0; }
            processedTime[label].sum += avg; processedTime[label].cnt++;

            let valUser = 0; 
            if(grouped[date][targetName]) { valUser = grouped[date][targetName].quantidade; }
            processedMain[label] += valUser; 
        });

        const labels = Object.keys(processedTime).sort();
        const dataMain = [], dataBench = [];
        let statsDias = 0, statsBest = 0, statsBatida = 0;

        labels.forEach(k => {
            const valTime = Math.round(processedTime[k].sum / processedTime[k].cnt);
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

        const elDias = document.getElementById('evo-dias'); if(elDias) elDias.innerText = statsDias;
        const elTaxa = document.getElementById('evo-taxa'); if(elTaxa) elTaxa.innerText = statsDias ? Math.round((statsBatida/statsDias)*100) + '%' : '0%';
        const elBest = document.getElementById('evo-best'); if(elBest) elBest.innerText = statsBest;

        const ctx = document.getElementById('chartPrincipal').getContext('2d');
        if(this.chartInstance) this.chartInstance.destroy();
        
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(37, 99, 235, 0.2)');
        gradient.addColorStop(1, 'rgba(37, 99, 235, 0)');

        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.map(k => agruparPorMes ? k.split('-').reverse().join('/') : k.split('-').reverse().slice(0, 2).join('/')),
                datasets: [
                    { label: viewingTime ? 'Média Equipa' : targetName, data: dataMain, borderColor: '#2563eb', backgroundColor: gradient, borderWidth: 3, tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#fff', pointBorderColor: '#2563eb' },
                    { label: viewingTime ? 'Meta (650)' : 'Média Equipa', data: dataBench, borderColor: viewingTime ? '#10b981' : '#94a3b8', borderWidth: 2, borderDash: [6, 6], tension: 0.4, pointRadius: 0, fill: false }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { weight: 'bold' }, padding: 20 } } }, scales: { y: { beginAtZero: true, grid: { borderDash: [4, 4] } }, x: { grid: { display: false } } } }
        });
    }
};