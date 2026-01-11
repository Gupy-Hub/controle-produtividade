/**
 * Módulo de Assertividade - v2.2
 */
Gestao.Assertividade = {
    paginaAtual: 1,
    itensPorPagina: 50,
    totalRegistros: 0,
    filtrosAtivos: {},
    filtroPeriodo: 'mes',
    assistentesCarregados: false,

    carregar: async function() {
        this.popularSeletoresIniciais();
        if (!this.assistentesCarregados) {
            await this.carregarAssistentes();
            this.assistentesCarregados = true;
        }
        this.mudarPeriodo('mes', false);
        this.buscarDados();
    },

    carregarAssistentes: async function() {
        const select = document.getElementById('sel-assert-assistente');
        if (!select) return;
        try {
            const { data, error } = await Sistema.supabase
                .from('usuarios')
                .select('id, nome')
                .neq('funcao', 'GESTORA')
                .neq('funcao', 'AUDITORA')
                .order('nome');
            if (error) throw error;
            let html = '<option value="">👤 Todos Assistentes</option>';
            data.forEach(u => html += `<option value="${u.id}">${u.nome}</option>`);
            select.innerHTML = html;
        } catch (e) { console.error(e); }
    },

    popularSeletoresIniciais: function() {
        const anoSelect = document.getElementById('sel-assert-ano');
        if (anoSelect && anoSelect.options.length === 0) {
            const anoAtual = new Date().getFullYear();
            let html = '';
            for (let i = anoAtual + 1; i >= anoAtual - 2; i--) {
                html += `<option value="${i}" ${i === anoAtual ? 'selected' : ''}>${i}</option>`;
            }
            anoSelect.innerHTML = html;
        }
        const mesSelect = document.getElementById('sel-assert-mes');
        if (mesSelect && mesSelect.options.length === 0) {
            const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
            mesSelect.innerHTML = meses.map((m, i) => `<option value="${i}" ${i === new Date().getMonth() ? 'selected' : ''}>${m}</option>`).join('');
        }
    },

    mudarPeriodo: function(tipo, buscar = true) {
        this.filtroPeriodo = tipo;
        ['mes', 'semana', 'ano'].forEach(t => {
            const btn = document.getElementById(`btn-assert-${t}`);
            if(btn) btn.className = (t === tipo) ? "px-3 py-1 text-xs font-bold rounded bg-blue-50 text-blue-600 border border-blue-100" : "px-3 py-1 text-xs font-bold rounded text-slate-500";
        });
        document.getElementById('sel-assert-mes').classList.toggle('hidden', tipo === 'ano');
        document.getElementById('sel-assert-semana').classList.toggle('hidden', tipo !== 'semana');
        document.getElementById('sel-assert-subano').classList.toggle('hidden', tipo !== 'ano');
        if(buscar) { this.paginaAtual = 1; this.buscarDados(); }
    },

    getDatasFiltro: function() {
        const ano = parseInt(document.getElementById('sel-assert-ano').value);
        const mes = parseInt(document.getElementById('sel-assert-mes').value);
        let inicio, fim;
        const fmt = (d) => d.toISOString().split('T')[0];

        if (this.filtroPeriodo === 'mes') {
            inicio = new Date(ano, mes, 1);
            fim = new Date(ano, mes + 1, 0);
        } else if (this.filtroPeriodo === 'semana') {
            const sem = parseInt(document.getElementById('sel-assert-semana').value);
            inicio = new Date(ano, mes, (sem - 1) * 7 + 1);
            fim = new Date(ano, mes, (sem - 1) * 7 + 7);
        } else {
            const sub = document.getElementById('sel-assert-subano').value;
            if (sub === 'full') { inicio = new Date(ano, 0, 1); fim = new Date(ano, 11, 31); }
            else if (sub === 'S1') { inicio = new Date(ano, 0, 1); fim = new Date(ano, 5, 30); }
            else { inicio = new Date(ano, 6, 1); fim = new Date(ano, 11, 31); }
        }
        return { inicio: fmt(inicio), fim: fmt(fim) };
    },

    buscarDados: async function() {
        const tbody = document.getElementById('lista-assertividade');
        if(!tbody) return;

        const { inicio, fim } = this.getDatasFiltro();
        const assistenteId = document.getElementById('sel-assert-assistente').value;
        const status = document.getElementById('filtro-status').value;

        tbody.innerHTML = '<tr><td colspan="11" class="text-center py-20"><i class="fas fa-spinner fa-spin text-blue-500"></i></td></tr>';

        // PAYLOAD LIMPO: Apenas 6 parâmetros
        const params = {
            p_pagina: parseInt(this.paginaAtual),
            p_tamanho: parseInt(this.itensPorPagina),
            p_data_inicio: inicio,
            p_data_fim: fim,
            p_assistente_id: assistenteId ? parseInt(assistenteId) : null,
            p_filtro_status: status || null
        };

        console.log("🚀 RPC Call v2.2:", params);

        try {
            const { data, error } = await Sistema.supabase.rpc('buscar_assertividade_v5', params);
            if (error) throw error;
            this.renderizarTabela(data);
            this.atualizarPaginacao(data);
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="11" class="p-10 text-center text-rose-500">Erro: ${e.message}</td></tr>`;
        }
    },

    renderizarTabela: function(dados) {
        const tbody = document.getElementById('lista-assertividade');
        tbody.innerHTML = '';
        if (!dados || dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="py-10 text-center text-slate-400">Nenhum dado.</td></tr>';
            return;
        }
        dados.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 border-b text-xs";
            tr.innerHTML = `
                <td class="px-4 py-2">${row.data_auditoria.split('-').reverse().join('/')}</td>
                <td class="px-4 py-2 font-bold">${row.empresa || '-'}</td>
                <td class="px-4 py-2">${row.assistente || '-'}</td>
                <td class="px-4 py-2 truncate max-w-[150px]">${row.doc_name || '-'}</td>
                <td class="px-4 py-2 text-center">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${this.getColor(row.status)}">${row.status}</span>
                </td>
                <td class="px-4 py-2 truncate max-w-[150px]">${row.obs || '-'}</td>
                <td class="px-4 py-2 text-center">${row.campos}</td>
                <td class="px-4 py-2 text-center text-emerald-600 font-bold">${row.ok}</td>
                <td class="px-4 py-2 text-center text-rose-600 font-bold">${row.nok}</td>
                <td class="px-4 py-2 text-center font-bold">${row.porcentagem}</td>
                <td class="px-4 py-2 text-slate-400">${row.auditora}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    atualizarPaginacao: function(dados) {
        const total = dados?.[0]?.total_registros || 0;
        document.getElementById('info-paginacao').innerText = `Pág ${this.paginaAtual}`;
        document.getElementById('contador-assert').innerText = `| Total: ${total}`;
        const btnAnt = document.getElementById('btn-ant');
        const btnProx = document.getElementById('btn-prox');
        btnAnt.disabled = this.paginaAtual === 1;
        btnProx.disabled = (this.paginaAtual * this.itensPorPagina) >= total;
        btnAnt.onclick = () => { this.paginaAtual--; this.buscarDados(); };
        btnProx.onclick = () => { this.paginaAtual++; this.buscarDados(); };
    },

    getColor: function(s) {
        if (s?.includes('OK')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        if (s?.includes('NOK')) return 'bg-rose-50 text-rose-700 border-rose-200';
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
};