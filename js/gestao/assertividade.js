/**
 * Módulo de Assertividade - v3.0 (Blindado contra Cache)
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
        } catch (e) { console.error("Erro ao carregar assistentes:", e); }
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
        
        document.getElementById('sel-assert-mes')?.classList.toggle('hidden', tipo === 'ano');
        document.getElementById('sel-assert-semana')?.classList.toggle('hidden', tipo !== 'semana');
        document.getElementById('sel-assert-subano')?.classList.toggle('hidden', tipo !== 'ano');
        
        if(buscar) { this.paginaAtual = 1; this.buscarDados(); }
    },

    getDatasFiltro: function() {
        // Correção para evitar NaN: garante que os valores existam
        const anoEl = document.getElementById('sel-assert-ano');
        const mesEl = document.getElementById('sel-assert-mes');
        
        const ano = parseInt(anoEl?.value) || new Date().getFullYear();
        const mes = parseInt(mesEl?.value) || new Date().getMonth();
        
        let inicio, fim;

        const fmt = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        if (this.filtroPeriodo === 'mes') {
            inicio = new Date(ano, mes, 1);
            fim = new Date(ano, mes + 1, 0);
        } else if (this.filtroPeriodo === 'semana') {
            const sem = parseInt(document.getElementById('sel-assert-semana')?.value) || 1;
            inicio = new Date(ano, mes, (sem - 1) * 7 + 1);
            fim = new Date(ano, mes, (sem - 1) * 7 + 7);
        } else {
            const sub = document.getElementById('sel-assert-subano')?.value || 'full';
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
        const assistenteId = document.getElementById('sel-assert-assistente')?.value;
        const status = document.getElementById('filtro-status')?.value;

        tbody.innerHTML = '<tr><td colspan="11" class="text-center py-20"><i class="fas fa-spinner fa-spin text-blue-500 text-3xl"></i></td></tr>';

        // PAYLOAD BLINDADO: Apenas os 6 parâmetros que o banco espera
        const params = {
            p_pagina: parseInt(this.paginaAtual),
            p_tamanho: parseInt(this.itensPorPagina),
            p_data_inicio: inicio,
            p_data_fim: fim,
            p_assistente_id: assistenteId ? parseInt(assistenteId) : null,
            p_filtro_status: status || null
        };

        console.log("🚀 RPC Call v3.0:", params);

        try {
            const { data, error } = await Sistema.supabase.rpc('buscar_assertividade_v5', params);
            if (error) throw error;
            this.renderizarTabela(data);
            this.atualizarPaginacao(data, `${inicio} a ${fim}`);
        } catch (e) {
            console.error("Erro na busca:", e);
            tbody.innerHTML = `<tr><td colspan="11" class="p-10 text-center text-rose-500">Erro: ${e.message}</td></tr>`;
        }
    },

    renderizarTabela: function(dados) {
        const tbody = document.getElementById('lista-assertividade');
        tbody.innerHTML = '';
        if (!dados || dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="py-16 text-center text-slate-400">Nenhum dado encontrado.</td></tr>';
            return;
        }
        dados.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 border-b text-xs transition";
            const dataFmt = row.data_auditoria ? row.data_auditoria.split('-').reverse().join('/') : '-';
            const statusColor = this.getColor(row.status);

            tr.innerHTML = `
                <td class="px-4 py-3 font-mono text-slate-500">${dataFmt}</td>
                <td class="px-4 py-3 font-bold text-slate-700">${row.empresa || '-'}</td>
                <td class="px-4 py-3 text-slate-600">${row.assistente || '-'}</td>
                <td class="px-4 py-3 text-slate-600 truncate max-w-[150px]">${row.doc_name || '-'}</td>
                <td class="px-4 py-3 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${statusColor}">${row.status || '-'}</span>
                </td>
                <td class="px-4 py-3 text-slate-500 truncate max-w-[150px]">${row.obs || '-'}</td>
                <td class="px-4 py-3 text-center font-mono">${row.campos || 0}</td>
                <td class="px-4 py-3 text-center text-emerald-600 font-bold bg-emerald-50">${row.ok || 0}</td>
                <td class="px-4 py-3 text-center text-rose-600 font-bold bg-rose-50">${row.nok || 0}</td>
                <td class="px-4 py-3 text-center font-bold text-slate-700">${row.porcentagem || '-'}</td>
                <td class="px-4 py-3 text-slate-400 italic">${row.auditora || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    atualizarPaginacao: function(dados, label) {
        const total = (dados && dados.length > 0) ? dados[0].total_registros : 0;
        document.getElementById('info-paginacao').innerText = `Pág ${this.paginaAtual} de ${Math.ceil(total/this.itensPorPagina) || 1}`;
        document.getElementById('contador-assert').innerHTML = `<span class="bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100 ml-2">Total: ${total}</span>`;
        
        const btnAnt = document.getElementById('btn-ant');
        const btnProx = document.getElementById('btn-prox');
        if(btnAnt) btnAnt.disabled = this.paginaAtual === 1;
        if(btnProx) btnProx.disabled = (this.paginaAtual * this.itensPorPagina) >= total;
        
        btnAnt.onclick = () => { if(this.paginaAtual > 1) { this.paginaAtual--; this.buscarDados(); } };
        btnProx.onclick = () => { if((this.paginaAtual * this.itensPorPagina) < total) { this.paginaAtual++; this.buscarDados(); } };
    },

    getColor: function(s) {
        if (!s) return 'bg-slate-50 text-slate-400 border-slate-200';
        const status = s.toUpperCase();
        if (status.includes('OK')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        if (status.includes('NOK')) return 'bg-rose-50 text-rose-700 border-rose-200';
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
};