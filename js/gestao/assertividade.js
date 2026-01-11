Gestao.Assertividade = {
    paginaAtual: 1,
    itensPorPagina: 50,
    totalRegistros: 0,
    filtrosAtivos: {},
    timeoutBusca: null,
    
    // Configurações
    filtroPeriodo: 'mes', // 'mes', 'semana', 'ano'
    assistentesCarregados: false,

    initListeners: function() {
        // Listener Busca Global
        const search = document.getElementById('search-assert');
        if(search) search.addEventListener('keyup', () => this.atualizarFiltrosEBuscar());
    },

    carregar: async function() {
        this.popularSeletoresIniciais();
        
        // Carrega lista de assistentes se ainda não fez
        if (!this.assistentesCarregados) {
            await this.carregarAssistentes();
            this.assistentesCarregados = true;
        }

        this.mudarPeriodo('mes', false); // Default para Mês atual
        this.paginaAtual = 1;
        this.capturarFiltros();
        this.buscarDados();
    },

    carregarAssistentes: async function() {
        const select = document.getElementById('sel-assert-assistente');
        if (!select) return;

        try {
            // Busca apenas quem não é gestor/auditor para a lista
            const { data, error } = await Sistema.supabase
                .from('usuarios')
                .select('id, nome')
                .neq('funcao', 'GESTORA')
                .neq('funcao', 'AUDITORA')
                .order('nome');

            if (error) throw error;

            let html = '<option value="">👤 Todos Assistentes</option>';
            data.forEach(u => {
                html += `<option value="${u.id}">${u.nome}</option>`;
            });
            select.innerHTML = html;

        } catch (e) {
            console.error("Erro ao carregar assistentes:", e);
            select.innerHTML = '<option value="">Erro ao carregar</option>';
        }
    },

    // --- LÓGICA DE DATA ---

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
        
        // Estilo dos botões
        ['mes', 'semana', 'ano'].forEach(t => {
            const btn = document.getElementById(`btn-assert-${t}`);
            if(btn) {
                btn.className = (t === tipo) 
                    ? "px-3 py-1 text-xs font-bold rounded bg-blue-50 text-blue-600 shadow-sm border border-blue-100 transition"
                    : "px-3 py-1 text-xs font-bold rounded text-slate-500 hover:bg-slate-50 transition border border-transparent";
            }
        });

        // Visibilidade dos selects
        const selMes = document.getElementById('sel-assert-mes');
        const selSemana = document.getElementById('sel-assert-semana');
        const selSubAno = document.getElementById('sel-assert-subano');

        if(selMes) selMes.classList.remove('hidden');
        if(selSemana) selSemana.classList.add('hidden');
        if(selSubAno) selSubAno.classList.add('hidden');

        if (tipo === 'semana') {
            if(selSemana) selSemana.classList.remove('hidden');
        } else if (tipo === 'ano') {
            if(selMes) selMes.classList.add('hidden');
            if(selSubAno) selSubAno.classList.remove('hidden');
        }

        if(buscar) this.atualizarPeriodo();
    },

    atualizarPeriodo: function() {
        this.paginaAtual = 1;
        this.buscarDados();
    },

    getDatasFiltro: function() {
        const anoEl = document.getElementById('sel-assert-ano');
        const mesEl = document.getElementById('sel-assert-mes');
        if (!anoEl || !mesEl) return { inicio: null, fim: null };

        const ano = parseInt(anoEl.value);
        const mes = parseInt(mesEl.value);
        
        let inicio, fim;

        try {
            if (this.filtroPeriodo === 'mes') {
                inicio = new Date(ano, mes, 1);
                fim = new Date(ano, mes + 1, 0);
            } else if (this.filtroPeriodo === 'semana') {
                const semanaIndex = parseInt(document.getElementById('sel-assert-semana').value);
                const diaInicio = (semanaIndex - 1) * 7 + 1;
                let diaFim = diaInicio + 6;
                const ultimoDiaMes = new Date(ano, mes + 1, 0).getDate();
                if (diaFim > ultimoDiaMes) diaFim = ultimoDiaMes;
                inicio = new Date(ano, mes, diaInicio);
                fim = new Date(ano, mes, diaFim);
            } else if (this.filtroPeriodo === 'ano') {
                const sub = document.getElementById('sel-assert-subano').value;
                if (sub === 'full') { inicio = new Date(ano, 0, 1); fim = new Date(ano, 11, 31); }
                else if (sub === 'S1') { inicio = new Date(ano, 0, 1); fim = new Date(ano, 5, 30); }
                else if (sub === 'S2') { inicio = new Date(ano, 6, 1); fim = new Date(ano, 11, 31); }
                else if (sub.startsWith('T')) {
                    const tri = parseInt(sub.replace('T', ''));
                    const mesInicio = (tri - 1) * 3;
                    const mesFim = mesInicio + 3;
                    inicio = new Date(ano, mesInicio, 1);
                    fim = new Date(ano, mesFim, 0);
                }
            }

            const fmt = (d) => {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };
            
            return { inicio: fmt(inicio), fim: fmt(fim) };
        } catch (e) {
            console.error(e);
            return { inicio: null, fim: null };
        }
    },

    // --- BUSCA ---

    capturarFiltros: function() {
        const get = (id) => { const el = document.getElementById(id); return el && el.value.trim() ? el.value.trim() : null; };
        
        this.filtrosAtivos = {
            global: get('search-assert'),
            assistenteId: get('sel-assert-assistente'), // Pega o ID
            status: get('filtro-status')
        };
    },

    atualizarFiltrosEBuscar: function() {
        if (this.timeoutBusca) clearTimeout(this.timeoutBusca);
        this.timeoutBusca = setTimeout(() => {
            this.paginaAtual = 1;
            this.capturarFiltros();
            this.buscarDados();
        }, 400);
    },

    buscarDados: async function() {
        const tbody = document.getElementById('lista-assertividade');
        const contador = document.getElementById('contador-assert');
        if(!tbody) return;

        const { inicio, fim } = this.getDatasFiltro();
        const dataLegivel = `${inicio ? inicio.split('-').reverse().join('/') : '?'} até ${fim ? fim.split('-').reverse().join('/') : '?'}`;

        tbody.innerHTML = '<tr><td colspan="12" class="text-center py-20"><i class="fas fa-circle-notch fa-spin text-blue-500 text-3xl"></i><p class="text-slate-400 mt-2">Buscando dados...</p></td></tr>';
        if(contador) contador.innerHTML = '';

        try {
            // Conversão segura do ID do assistente (string vazia vira null)
            const idAssistente = this.filtrosAtivos.assistenteId ? parseInt(this.filtrosAtivos.assistenteId) : null;

            const params = {
                p_pagina: this.paginaAtual,
                p_tamanho: this.itensPorPagina,
                p_busca_global: this.filtrosAtivos.global,
                p_data_inicio: inicio,
                p_data_fim: fim,
                p_assistente_id: idAssistente, // Agora envia o ID numérico!
                p_filtro_status: this.filtrosAtivos.status
            };

            const { data, error } = await Sistema.supabase.rpc('buscar_assertividade_v5', params);
            if (error) throw error;

            this.renderizarTabela(data);
            this.atualizarPaginacao(data, dataLegivel);

        } catch (e) {
            console.error("Erro busca:", e);
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-10 text-rose-500"><i class="fas fa-exclamation-triangle"></i> Erro: ${e.message}</td></tr>`;
        }
    },

    renderizarTabela: function(dados) {
        const tbody = document.getElementById('lista-assertividade');
        tbody.innerHTML = '';

        if (!dados || dados.length === 0) {
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-16 text-slate-400"><i class="far fa-folder-open text-3xl mb-3 block"></i>Nenhum registro encontrado neste período.</td></tr>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        dados.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-blue-50/50 transition border-b border-slate-50 text-xs group";
            
            let dataFmt = '-';
            if(row.data_auditoria) {
                const [Y, M, D] = row.data_auditoria.split('-');
                dataFmt = `${D}/${M}/${Y}`;
            }

            const statusClass = this.getStatusColor(row.status);

            tr.innerHTML = `
                <td class="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">${dataFmt}</td>
                <td class="px-4 py-3 font-bold text-slate-700 truncate max-w-[200px]" title="${row.empresa}">${row.empresa || '-'}</td>
                <td class="px-4 py-3 text-slate-600 truncate max-w-[150px]" title="${row.assistente}">${row.assistente || '-'}</td>
                <td class="px-4 py-3 text-slate-600 truncate max-w-[150px]" title="${row.doc_name}">${row.doc_name || '-'}</td>
                <td class="px-4 py-3 text-center"><span class="${statusClass} px-2 py-0.5 rounded text-[10px] font-bold border block w-full truncate">${row.status || '-'}</span></td>
                <td class="px-4 py-3 text-slate-500 truncate max-w-[200px]" title="${row.obs}">${row.obs || '-'}</td>
                <td class="px-4 py-3 text-center font-mono text-slate-400">${row.campos || 0}</td>
                <td class="px-4 py-3 text-center text-emerald-600 font-bold bg-emerald-50 rounded">${row.ok || 0}</td>
                <td class="px-4 py-3 text-center text-rose-600 font-bold bg-rose-50 rounded">${row.nok || 0}</td>
                <td class="px-4 py-3 text-center font-bold text-slate-700">${row.porcentagem || '-'}</td>
                <td class="px-4 py-3 text-slate-500 truncate max-w-[100px]">${row.auditora || '-'}</td>
            `;
            fragment.appendChild(tr);
        });
        tbody.appendChild(fragment);
    },

    atualizarPaginacao: function(dados, labelPeriodo) {
        const total = (dados && dados.length > 0) ? dados[0].total_registros : 0;
        this.totalRegistros = total;
        
        const elInfo = document.getElementById('info-paginacao');
        const elContador = document.getElementById('contador-assert');
        
        if(elInfo) elInfo.innerText = `Pág ${this.paginaAtual} de ${Math.ceil(total/this.itensPorPagina) || 1}`;
        if(elContador) elContador.innerHTML = `
            <span class="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-100 ml-2">Período: ${labelPeriodo}</span>
            <span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200 ml-1">Total: ${total}</span>
        `;
        
        const btnAnt = document.getElementById('btn-ant');
        const btnProx = document.getElementById('btn-prox');
        
        if(btnAnt) {
            btnAnt.disabled = this.paginaAtual === 1;
            btnAnt.onclick = () => { this.paginaAtual--; this.buscarDados(); };
        }
        if(btnProx) {
            btnProx.disabled = (this.paginaAtual * this.itensPorPagina) >= total;
            btnProx.onclick = () => { this.paginaAtual++; this.buscarDados(); };
        }
    },

    getStatusColor: function(status) {
        if(!status) return 'bg-slate-100 text-slate-400 border-slate-200';
        const s = status.toString().toUpperCase();
        if(s.includes('OK')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        if(s.includes('NOK')) return 'bg-rose-100 text-rose-700 border-rose-200';
        if(s.includes('REV')) return 'bg-amber-100 text-amber-700 border-amber-200';
        if(s.includes('JUST')) return 'bg-blue-100 text-blue-700 border-blue-200';
        if(s.includes('IA')) return 'bg-indigo-100 text-indigo-700 border-indigo-200';
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
};