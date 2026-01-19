// ARQUIVO: js/gestao/assertividade.js
window.Gestao = window.Gestao || {};

Gestao.Assertividade = {
    chartErro: null,
    chartAcerto: null,

    init: function() {
        console.log("📊 Gestão Assertividade: Engine V3 Iniciada");
        this.popularAnos();
        this.setDefaultDates();
        this.carregar();
    },

    popularAnos: function() {
        const sel = document.getElementById('assert-sel-ano');
        if(!sel) return;
        const anoAtual = new Date().getFullYear();
        for(let i = anoAtual; i >= 2024; i--) {
            sel.innerHTML += `<option value="${i}">${i}</option>`;
        }
    },

    setDefaultDates: function() {
        const hoje = new Date();
        document.getElementById('assert-sel-mes').value = hoje.getMonth();
        document.getElementById('assert-sel-data').value = hoje.toISOString().split('T')[0];
    },

    togglePeriodo: function() {
        const tipo = document.getElementById('assert-tipo-periodo').value;
        document.getElementById('assert-container-mes').classList.toggle('hidden', tipo !== 'mes');
        document.getElementById('assert-container-dia').classList.toggle('hidden', tipo !== 'dia');
        this.carregar();
    },

    getDatasFiltro: function() {
        const tipo = document.getElementById('assert-tipo-periodo').value;
        if (tipo === 'dia') {
            const data = document.getElementById('assert-sel-data').value;
            return { inicio: data, fim: data };
        } else {
            const ano = document.getElementById('assert-sel-ano').value;
            const mes = document.getElementById('assert-sel-mes').value;
            const ini = new Date(ano, mes, 1);
            const fim = new Date(ano, parseInt(mes) + 1, 0);
            const f = (d) => d.toISOString().split('T')[0];
            return { inicio: f(ini), fim: f(fim) };
        }
    },

    carregar: async function() {
        const tbody = document.getElementById('assert-table-body');
        const datas = this.getDatasFiltro();
        
        if(!tbody || !datas.inicio) return;
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Analisando dados do período...</td></tr>';

        try {
            const { data, error } = await Sistema.supabase
                .from('assertividade')
                .select('*')
                .gte('data_referencia', datas.inicio)
                .lte('data_referencia', datas.fim)
                .order('data_referencia', { ascending: false });

            if (error) throw error;

            this.renderizar(data);
            this.processarGraficos(data);

        } catch (error) {
            console.error("Erro busca:", error);
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-rose-500 font-bold">Erro: ${error.message}</td></tr>`;
        }
    },

    renderizar: function(data) {
        const tbody = document.getElementById('assert-table-body');
        tbody.innerHTML = '';

        if(data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-10 text-slate-400">Nenhum dado encontrado para o período.</td></tr>';
            return;
        }

        let somaAssert = 0;
        data.forEach(item => {
            const pct = parseFloat(item.porcentagem_assertividade?.replace('%', '').replace(',', '.')) || 0;
            somaAssert += pct;

            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="px-6 py-3 text-slate-500 font-medium">${new Date(item.data_referencia + 'T12:00:00').toLocaleDateString()}</td>
                    <td class="px-6 py-3 font-bold text-slate-700">${item.assistente_nome || '-'}</td>
                    <td class="px-6 py-3 text-slate-600">${item.doc_name || '-'}</td>
                    <td class="px-6 py-3 text-center font-mono">${item.qtd_campos || 0}</td>
                    <td class="px-6 py-3 text-center font-bold text-emerald-600">${item.qtd_ok || 0}</td>
                    <td class="px-6 py-3 text-center font-bold text-rose-600">${item.qtd_nok || 0}</td>
                    <td class="px-6 py-3 text-center">
                        <span class="px-2 py-1 rounded text-[10px] font-bold ${pct >= 98 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
                            ${item.porcentagem_assertividade || '0%'}
                        </span>
                    </td>
                    <td class="px-6 py-3 text-slate-500">${item.auditora_nome || '-'}</td>
                </tr>
            `;
        });

        // Atualiza KPIs
        document.getElementById('kpi-assert-total').innerText = data.length.toLocaleString();
        document.getElementById('kpi-assert-media').innerText = (somaAssert / data.length).toFixed(2).replace('.', ',') + '%';
    },

    processarGraficos: function(data) {
        const mapaErros = {};
        const mapaAcertos = {};

        data.forEach(item => {
            const doc = item.doc_name || 'Desconhecido';
            mapaErros[doc] = (mapaErros[doc] || 0) + (item.qtd_nok || 0);
            mapaAcertos[doc] = (mapaAcertos[doc] || 0) + (item.qtd_ok || 0);
        });

        const topErros = Object.entries(mapaErros).sort((a,b) => b[1] - a[1]).slice(0, 5);
        const topAcertos = Object.entries(mapaAcertos).sort((a,b) => b[1] - a[1]).slice(0, 5);

        // Atualiza KPI de Ofensor
        document.getElementById('kpi-assert-offensor').innerText = topErros[0] ? topErros[0][0] : '--';
        document.getElementById('kpi-assert-doc').innerText = topErros[0] ? topErros[0][0] : '--';

        this.renderizarGrafico('chartDocsErro', topErros, '#f43f5e', 'Erro');
        this.renderizarGrafico('chartDocsAcerto', topAcertos, '#10b981', 'Acerto');
    },

    renderizarGrafico: function(canvasId, dados, cor, label) {
        const ctx = document.getElementById(canvasId);
        if(!ctx) return;

        if (canvasId === 'chartDocsErro' && this.chartErro) this.chartErro.destroy();
        if (canvasId === 'chartDocsAcerto' && this.chartAcerto) this.chartAcerto.destroy();

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dados.map(d => d[0].substring(0, 15) + '...'),
                datasets: [{
                    label: label + 's',
                    data: dados.map(d => d[1]),
                    backgroundColor: cor,
                    borderRadius: 5
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { grid: { display: false } }, y: { grid: { display: false } } }
            }
        });

        if (canvasId === 'chartDocsErro') this.chartErro = chart;
        else this.chartAcerto = chart;
    }
};