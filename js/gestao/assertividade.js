window.Gestao = window.Gestao || {};

Gestao.Assertividade = {
    inicializado: false, // Controle para não recriar filtros toda hora
    
    filtros: {
        data: '',
        empresa: '',
        assistente: '',
        auditora: '',
        status: '',
        doc: ''
    },

    // Esta é a função que o main.js chama quando clica na aba
    carregar: async function() {
        const tabelaDiv = document.getElementById('tabela-dados');
        
        // 1. Auto-Inicialização: Cria os filtros se ainda não existirem
        if (!this.inicializado) {
            // Mostra um feedback visual enquanto prepara o ambiente
            if (tabelaDiv) tabelaDiv.innerHTML = '<div class="text-center p-10"><i class="fas fa-circle-notch fa-spin fa-2x text-indigo-600"></i><p class="mt-2 text-gray-500">Preparando filtros...</p></div>';
            
            this.renderizarFiltros();
            await this.carregarOpcoesFiltros(); // Busca opções no banco
            this.inicializado = true;
        }

        // 2. Carrega os dados da tabela
        this.buscarEExibirTabela();
    },

    renderizarFiltros: function() {
        const container = document.getElementById('filtros-dinamicos');
        if (!container) return;

        container.innerHTML = `
            <div class="bg-white p-4 rounded-lg shadow mb-4 animate-fade-in">
                <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
                    
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase">Data Ref.</label>
                        <input type="date" id="filtro-data" 
                            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs">
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase">Empresa</label>
                        <select id="filtro-empresa" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs bg-gray-50">
                            <option value="">Carregando...</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase">Assistente</label>
                        <select id="filtro-assistente" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs bg-gray-50">
                            <option value="">Carregando...</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase">Auditora</label>
                        <select id="filtro-auditora" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs bg-gray-50">
                            <option value="">Carregando...</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase">Status</label>
                        <select id="filtro-status" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs bg-gray-50">
                            <option value="">Carregando...</option>
                        </select>
                    </div>

                    <div class="flex gap-2">
                        <button id="btn-filtrar" class="flex-1 bg-indigo-600 text-white px-3 py-2 rounded-md hover:bg-indigo-700 text-xs font-bold shadow transition">
                            <i class="fas fa-filter"></i> Filtrar
                        </button>
                        <button id="btn-limpar" class="bg-gray-200 text-gray-700 px-3 py-2 rounded-md hover:bg-gray-300 text-xs font-bold shadow transition" title="Limpar">
                            <i class="fas fa-eraser"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Event Listeners
        document.getElementById('btn-filtrar').addEventListener('click', () => this.aplicarFiltros());
        document.getElementById('btn-limpar').addEventListener('click', () => this.limparFiltros());
        
        // Enter para filtrar
        container.querySelectorAll('select, input').forEach(el => {
            el.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.aplicarFiltros();
            });
        });
    },

    carregarOpcoesFiltros: async function() {
        try {
            // Chama a função do Banco de Dados
            const { data, error } = await Sistema.supabase.rpc('get_filtros_unicos');

            if (error) {
                console.warn("Erro ao carregar filtros (RPC):", error);
                return; // Não trava o sistema, apenas deixa os filtros vazios
            }

            if (!data) return;

            // Função para popular Selects
            const popular = (id, lista, placeholder = "Todos(as)") => {
                const select = document.getElementById(id);
                if (!select) return;
                
                select.innerHTML = `<option value="">${placeholder}</option>`;
                select.classList.remove('bg-gray-50'); // Remove fundo cinza de loading
                
                if (lista && Array.isArray(lista)) {
                    lista.forEach(item => {
                        if (item) {
                            const opt = document.createElement('option');
                            opt.value = item;
                            opt.textContent = item;
                            select.appendChild(opt);
                        }
                    });
                }
            };

            popular('filtro-empresa', data.empresas, "Todas as Empresas");
            popular('filtro-assistente', data.assistentes, "Todos os Assistentes");
            popular('filtro-auditora', data.auditoras, "Todas as Auditoras");
            popular('filtro-status', data.status, "Todos os Status");

        } catch (err) {
            console.error("Falha fatal nos filtros:", err);
        }
    },

    aplicarFiltros: function() {
        this.filtros.data = document.getElementById('filtro-data').value;
        this.filtros.empresa = document.getElementById('filtro-empresa').value;
        this.filtros.assistente = document.getElementById('filtro-assistente').value;
        this.filtros.auditora = document.getElementById('filtro-auditora').value;
        this.filtros.status = document.getElementById('filtro-status').value;
        
        this.buscarEExibirTabela();
    },

    limparFiltros: function() {
        document.getElementById('filtro-data').value = '';
        document.getElementById('filtro-empresa').value = '';
        document.getElementById('filtro-assistente').value = '';
        document.getElementById('filtro-auditora').value = '';
        document.getElementById('filtro-status').value = '';
        
        this.aplicarFiltros();
    },

    buscarEExibirTabela: async function() {
        const tabelaDiv = document.getElementById('tabela-dados');
        if (!tabelaDiv) return;

        tabelaDiv.innerHTML = '<div class="text-center p-10"><i class="fas fa-spinner fa-spin fa-2x text-indigo-600"></i><p class="mt-2 text-gray-500">Carregando dados...</p></div>';

        try {
            let query = Sistema.supabase
                .from('assertividade')
                .select('*')
                .order('data_referencia', { ascending: false })
                .order('id', { ascending: false })
                .limit(100);

            // Aplica os filtros ativos
            if (this.filtros.data) query = query.eq('data_referencia', this.filtros.data);
            if (this.filtros.empresa) query = query.eq('empresa_nome', this.filtros.empresa);
            if (this.filtros.assistente) query = query.eq('assistente_nome', this.filtros.assistente);
            if (this.filtros.auditora) query = query.eq('auditora_nome', this.filtros.auditora);
            if (this.filtros.status) query = query.eq('status', this.filtros.status);

            const { data, error } = await query;

            if (error) throw error;
            this.renderizarTabela(data || []);

        } catch (error) {
            console.error("Erro ao buscar dados:", error);
            tabelaDiv.innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg text-center"><i class="fas fa-exclamation-triangle"></i> Erro: ${error.message}</div>`;
        }
    },

    renderizarTabela: function(dados) {
        const tabelaDiv = document.getElementById('tabela-dados');
        
        if (dados.length === 0) {
            tabelaDiv.innerHTML = `
                <div class="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-100">
                    <i class="fas fa-filter text-4xl text-gray-300 mb-3"></i>
                    <p class="text-gray-500 font-medium">Nenhum registro encontrado.</p>
                </div>`;
            return;
        }

        let html = `
            <div class="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg bg-white">
                <table class="min-w-full divide-y divide-gray-300">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="py-3.5 pl-4 pr-3 text-left text-xs font-bold uppercase text-gray-500 sm:pl-6">Data</th>
                            <th class="px-3 py-3.5 text-left text-xs font-bold uppercase text-gray-500">Assistente</th>
                            <th class="px-3 py-3.5 text-left text-xs font-bold uppercase text-gray-500">Empresa</th>
                            <th class="px-3 py-3.5 text-left text-xs font-bold uppercase text-gray-500">Documento</th>
                            <th class="px-3 py-3.5 text-center text-xs font-bold uppercase text-gray-500">Status</th>
                            <th class="px-3 py-3.5 text-center text-xs font-bold uppercase text-gray-500">% Assert.</th>
                            <th class="px-3 py-3.5 text-center text-xs font-bold uppercase text-gray-500">OK / NOK</th>
                            <th class="relative py-3.5 pl-3 pr-4 sm:pr-6"><span class="sr-only">Ações</span></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 bg-white">
        `;

        dados.forEach(item => {
            let statusClass = 'bg-gray-100 text-gray-800';
            const st = (item.status || '').toUpperCase();
            if (st === 'OK' || st === 'VALIDO') statusClass = 'bg-green-100 text-green-800 border-green-200';
            else if (st === 'NOK' || st.includes('NOK')) statusClass = 'bg-red-100 text-red-800 border-red-200';
            else if (st.includes('REV')) statusClass = 'bg-yellow-100 text-yellow-800 border-yellow-200';

            const dataFmt = item.data_referencia ? item.data_referencia.split('-').reverse().join('/') : '-';
            const porc = item.porcentagem_assertividade || '0,00%';
            
            let corPorc = "text-gray-600";
            const valP = parseFloat(porc.replace('%','').replace(',','.'));
            if(valP >= 99) corPorc = "text-green-600 font-bold";
            else if(valP < 90) corPorc = "text-red-600 font-bold";

            html += `
                <tr class="hover:bg-gray-50 transition-colors text-xs">
                    <td class="whitespace-nowrap py-3 pl-4 pr-3 text-gray-900 sm:pl-6 font-mono">${dataFmt}</td>
                    <td class="whitespace-nowrap px-3 py-3 text-gray-600 font-medium">${Sistema.escapar(item.assistente_nome)}</td>
                    <td class="whitespace-nowrap px-3 py-3 text-gray-600">${Sistema.escapar(item.empresa_nome)}</td>
                    <td class="whitespace-nowrap px-3 py-3 text-gray-500" title="${Sistema.escapar(item.doc_name)}">
                        ${Sistema.escapar(item.doc_name).substring(0, 25)}${item.doc_name?.length > 25 ? '...' : ''}
                    </td>
                    <td class="whitespace-nowrap px-3 py-3 text-center">
                        <span class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold border ${statusClass}">${item.status}</span>
                    </td>
                    <td class="whitespace-nowrap px-3 py-3 text-center ${corPorc}">${porc}</td>
                    <td class="whitespace-nowrap px-3 py-3 text-center text-gray-500 font-mono">
                        <span class="text-green-600">${item.qtd_ok || 0}</span> / <span class="text-red-600">${item.qtd_nok || 0}</span>
                    </td>
                    <td class="relative whitespace-nowrap py-3 pl-3 pr-4 text-right sm:pr-6">
                        <button class="text-indigo-600 hover:text-indigo-900 font-bold hover:bg-indigo-50 px-2 py-1 rounded" onclick="alert('ID: ${item.id}')">Ver</button>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table></div>`;
        tabelaDiv.innerHTML = html;
    }
};