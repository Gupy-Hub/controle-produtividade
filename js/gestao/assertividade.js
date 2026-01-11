/**
 * Gestão de Assertividade - v2.2 (Correção de Assinatura RPC)
 * Objetivo: Sincronizar os 6 parâmetros exatos com o Supabase.
 */
Gestao.Assertividade = {
    paginaAtual: 1,
    itensPorPagina: 50,
    totalRegistros: 0,
    filtrosAtivos: {},
    timeoutBusca: null,
    
    filtroPeriodo: 'mes', 
    assistentesCarregados: false,

    initListeners: function() {
        // IDs dos elementos que disparam busca
        const ids = [
            'sel-assert-assistente', 'sel-assert-ano', 'sel-assert-mes', 
            'sel-assert-semana', 'sel-assert-subano', 'filtro-status'
        ];

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.onchange = () => {
                    this.paginaAtual = 1;
                    this.capturarFiltros();
                    this.buscarDados();
                };
            }
        });
    },

    carregar: async function() {
        this.popularSeletoresIniciais();
        
        if (!this.assistentesCarregados) {
            await this.carregarAssistentes();
            this.assistentesCarregados = true;
        }

        this.mudarPeriodo('mes', false);
        this.paginaAtual = 1;
        this.capturarFiltros();
        this.buscarDados(); // Chamada inicial
        this.initListeners();
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
        } catch (e) {
            console.error("Erro ao carregar assistentes:", e);
        }
    },

    popularSeletoresIniciais: function() {
        const anoSelect = document.getElementById('sel-assert-ano');
        if (anoSelect && anoSelect.options.length === 0) {
            const anoAtual = new Date().getFullYear();
            let htmlAnos = '';
            for (let i = anoAtual + 1; i >= anoAtual - 2; i--) {
                htmlAnos += `<option value="${i}" ${i === anoAtual ? 'selected' : ''}>${i}</option>`;
            }
            anoSelect.innerHTML = htmlAnos;
        }
        const mesSelect = document.getElementById('sel-assert-mes');
        if (mesSelect && !mesSelect.value) {
            mesSelect.value = new Date().getMonth();
        }
    },

    mudarPeriodo: function(tipo, buscar = true) {
        this.filtroPeriodo = tipo;
        ['mes', 'semana', 'ano'].forEach(t => {
            const btn = document.getElementById(`btn-assert-${t}`);
            if(btn) btn.className = (t === tipo) 
                ? "px-3 py-1 text-xs font-bold rounded bg-blue-50 text-blue-600 shadow-sm border border-blue-100 transition"
                : "px-3 py-1 text-xs font-bold rounded text-slate-500 hover:bg-slate-50 transition border border-transparent";
        });
        const selMes = document.getElementById('sel-assert-mes');
        const selSemana = document.getElementById('sel-assert-semana');
        const selSubAno = document.getElementById('sel-assert-subano');
        if(selMes) selMes.classList.remove('hidden');
        if(selSemana) selSemana.classList.add('hidden');
        if(selSubAno) selSubAno.classList.add('hidden');
        if (tipo === 'semana') { if(selSemana) selSemana.classList.remove('hidden'); }
        else if (tipo === 'ano') { if(selMes) selMes.classList.add('hidden'); if(selSubAno) selSubAno.classList.remove('hidden'); }
        if(buscar) this.buscarDados();
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

    capturarFiltros: function() {
        const get = (id) => { const el = document.getElementById(id); return el && el.value ? el.value : null; };
        this.filtrosAtivos = {
            assistenteId: get('sel-assert-assistente'),
            status: get('filtro-status')
        };
    },

    buscarDados: async function() {
        const tbody = document.getElementById('lista-assertividade');
        if(!tbody) return;

        const { inicio, fim } = this.getDatasFiltro();
        tbody.innerHTML = '<tr><td colspan="12" class="text-center py-20"><i class="fas fa-circle-notch fa-spin text-blue-500 text-3xl"></i></td></tr>';

        // --- CORREÇÃO CRÍTICA: APENAS 6 PARÂMETROS ---
        const params = {
            p_pagina: parseInt(this.paginaAtual),
            p_tamanho: parseInt(this.itensPorPagina),
            p_data_inicio: inicio,
            p_data_fim: fim,
            p_assistente_id: this.filtrosAtivos.assistenteId ? parseInt(this.filtrosAtivos.assistenteId) : null,
            p_filtro_status: this.filtrosAtivos.status || null
        };

        console.log("🚀 Enviando para RPC:", params);

        try {
            // Chamada ao Supabase
            const { data, error } = await Sistema.supabase.rpc('buscar_assertividade_v5', params);

            if (error) {
                console.error("❌ Erro PGRST202 detectado:", error);
                throw error;
            }

            this.renderizarTabela(data);
            this.atualizarPaginacao(data, `${inicio} a ${fim}`);
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-10 text-rose-500">Erro: ${e.message}</td></tr>`;
        }
    },

    renderizarTabela: function(dados) {
        const tbody = document.getElementById('lista-assertividade');
        tbody.innerHTML = '';
        if (!dados || dados.length === 0) {
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-16 text-slate-400">Nenhum dado encontrado.</td></tr>`;
            return;
        }
        dados.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-blue-50/50 transition border-b border-slate-50 text-xs";
            const dataFmt = row.data_auditoria ? row.data_auditoria.split('-').reverse().join('/') : '-';
            tr.innerHTML = `
                <td class="px-4 py-3 font-mono text-slate-500">${dataFmt}</td>
                <td class="px-4 py-3 font-bold text-slate-700 truncate max-w-[180px]">${row.empresa || '-'}</td>
                <td class="px-4 py-3 text-slate-600">${row.assistente || '-'}</td>
                <td class="px-4 py-3 text-slate-600 truncate max-w-[150px]">${row.doc_name || '-'}</td>
                <td class="px-4 py-3 text-center"><span class="${this.getStatusColor(row.status)} px-2 py-0.5 rounded text-[10px] font-bold border">${row.status || '-'}</span></td>
                <td class="px-4 py-3 text-slate-500 truncate max-w-[150px]">${row.obs || '-'}</td>
                <td class="px-4 py-3 text-center font-mono">${row.campos || 0}</td>
                <td class="px-4 py-3 text-center text-emerald-600 font-bold bg-emerald-50">${row.ok || 0}</td>
                <td class="px-4 py-3 text-center text-rose-600 font-bold bg-rose-50">${row.nok || 0}</td>
                <td class="px-4 py-3 text-center font-bold text-slate-700">${row.porcentagem || '-'}</td>
                <td class="px-4 py-3 text-slate-400 text-[10px] italic">${row.auditora || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    atualizarPaginacao: function(dados, label) {
        const total = (dados && dados.length > 0) ? dados[0].total_registros : 0;
        const elInfo = document.getElementById('info-paginacao');
        const elContador = document.getElementById('contador-assert');
        if(elInfo) elInfo.innerText = `Pág ${this.paginaAtual} de ${Math.ceil(total/this.itensPorPagina) || 1}`;
        if(elContador) elContador.innerHTML = `<span class="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-100 ml-2">Total: ${total}</span>`;
        const btnAnt = document.getElementById('btn-ant');
        const btnProx = document.getElementById('btn-prox');
        if(btnAnt) { btnAnt.disabled = this.paginaAtual === 1; btnAnt.onclick = () => { this.paginaAtual--; this.buscarDados(); }; }
        if(btnProx) { btnProx.disabled = (this.paginaAtual * this.itensPorPagina) >= total; btnProx.onclick = () => { this.paginaAtual++; this.buscarDados(); }; }
    },

    getStatusColor: function(status) {
        if(!status) return 'bg-slate-100 text-slate-400 border-slate-200';
        const s = status.toUpperCase();
        if(s.includes('OK')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        if(s.includes('NOK')) return 'bg-rose-100 text-rose-700 border-rose-200';
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
};