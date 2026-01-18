window.Gestao = window.Gestao || {};

Gestao.Assertividade = {
    filtros: {
        data: '', // Começa vazio para trazer tudo ou defina new Date()...
        empresa: '',
        assistente: '',
        auditora: '',
        status: '',
        doc: ''
    },

    init: async function() {
        this.renderizarFiltros();
        await this.carregarOpcoesFiltros(); // Busca as opções no banco
        this.carregar(); // Carrega a tabela
    },

    renderizarFiltros: function() {
        const container = document.getElementById('filtros-dinamicos');
        if (!container) return;

        // Layout Grid responsivo para os filtros
        container.innerHTML = `
            <div class="bg-white p-4 rounded-lg shadow mb-4">
                <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
                    
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase">Data Ref.</label>
                        <input type="date" id="filtro-data" 
                            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs">
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase">Empresa</label>
                        <select id="filtro-empresa" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs">
                            <option value="">Todas</option>
                            <option disabled>Carregando...</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase">Assistente</label>
                        <select id="filtro-assistente" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs">
                            <option value="">Todos</option>
                            <option disabled>Carregando...</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase">Auditora</label>
                        <select id="filtro-auditora" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs">
                            <option value="">Todas</option>
                            <option disabled>Carregando...</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase">Status</label>
                        <select id="filtro-status" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs">
                            <option value="">Todos</option>
                            <option disabled>Carregando...</option>
                        </select>
                    </div>

                    <div class="flex gap-2">
                        <button id="btn-filtrar" class="flex-1 bg-indigo-600 text-white px-3 py-2 rounded-md hover:bg-indigo-700 text-xs font-bold shadow">
                            <i class="fas fa-filter"></i> Filtrar
                        </button>
                        <button id="btn-limpar" class="bg-gray-200 text-gray-700 px-3 py-2 rounded-md hover:bg-gray-300 text-xs font-bold shadow" title="Limpar Filtros">
                            <i class="fas fa-eraser"></i>
                        </button>
                    </div>
                </div>
                
                <div class="mt-3">
                     <label class="block text-xs font-bold text-gray-700 uppercase">Tipo de Documento</label>
                     <select id="filtro-doc" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-xs">
                        <option value="">Todos os documentos</option>
                     </select>
                </div>
            </div>
        `;

        // Event Listeners
        document.getElementById('btn-filtrar').addEventListener('click', () => this.aplicarFiltros());
        document.getElementById('btn-limpar').addEventListener('click', () => this.limparFiltros());
        
        // Enter nos inputs dispara busca
        const inputs = container.querySelectorAll('select, input');
        inputs.forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.aplicarFiltros();
            });
        });
    },

    carregarOpcoesFiltros: async function() {
        try {
            // Chama a função RPC (Stored Procedure) que criamos no SQL
            const { data, error } = await Sistema.supabase.rpc('get_filtros_unicos');

            if (error) throw error;
            if (!data) return;

            // Função auxiliar para preencher Selects
            const preencher = (id, lista) => {
                const select = document.getElementById(id);
                if (!select) return;
                // Mantém a primeira opção (Todos) e remove o resto
                select.innerHTML = '<option value="">Todos(as)</option>';
                
                lista.forEach(item => {
                    if (item) { // Ignora nulos
                        const option = document.createElement('option');
                        option.value = item;
                        option.textContent = item;
                        select.appendChild(option);
                    }
                });
            };

            // Preenche cada campo com os dados vindos do banco
            preencher('filtro-empresa', data.empresas);
            preencher('filtro-assistente', data.assistentes);
            preencher('filtro-auditora', data.auditoras);
            preencher('filtro-status', data.status);
            preencher('filtro-doc', data.docs);

        } catch (error) {
            console.error("Erro ao carregar opções dos filtros:", error);
        }
    },

    aplicarFiltros: function() {
        this.filtros.data = document.getElementById('filtro-data').value;
        this.filtros.empresa = document.getElementById('filtro-empresa').value;
        this.filtros.assistente = document.getElementById('filtro-assistente').value;
        this.filtros.auditora = document.getElementById('filtro-auditora').value;
        this.filtros.status = document.getElementById('filtro-status').value;
        this.filtros.doc = document.getElementById('filtro-doc').value;
        
        this.carregar();
    },

    limparFiltros: function() {
        document.getElementById('filtro-data').value = '';
        document.getElementById('filtro-empresa').value = '';
        document.getElementById('filtro-assistente').value = '';
        document.getElementById('filtro-auditora').value = '';
        document.getElementById('filtro-status').value = '';
        document.getElementById('filtro-doc').value = '';
        
        this.aplicarFiltros();
    },

    carregar: async function() {
        const tabelaDiv = document.getElementById('tabela-dados');
        if (!tabelaDiv) return;

        tabelaDiv.innerHTML = '<div class="text-center p-10"><i class="fas fa-spinner fa-spin fa-2x text-indigo-600"></i><p class="mt-2 text-gray-500">Carregando dados...</p></div>';

        try {
            const dados = await this.buscarDados();
            this.renderizarTabela(dados);
        } catch (error) {
            console.error("Erro ao carregar:", error);
            tabelaDiv.innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg text-center"><i class="fas fa-exclamation-triangle"></i> Erro: ${error.message}</div>`;
        }
    },

    buscarDados: async function() {
        let query = Sistema.supabase
            .from('assertividade')
            .select('*')
            .order('data_referencia', { ascending: false })
            .order('id', { ascending: false })
            .limit(100);

        // --- APLICAÇÃO DOS FILTROS ---
        
        if (this.filtros.data) {
            query = query.eq('data_referencia', this.filtros.data);
        }

        // Como agora usamos SELECT (Dropdown), usamos filtro exato (.eq) e não busca (.ilike)
        if (this.filtros.empresa) query = query.eq('empresa_nome', this.filtros.empresa);
        if (this.filtros.assistente) query = query.eq('assistente_nome', this.filtros.assistente);
        if (this.filtros.auditora) query = query.eq('auditora_nome', this.filtros.auditora);
        if (this.filtros.status) query = query.eq('status', this.filtros.status);
        if (this.filtros.doc) query = query.eq('doc_name', this.filtros.doc);

        const { data, error } = await query;

        if (error) throw error;
        return data || [];
    },

    renderizarTabela: function(dados) {
        const tabelaDiv = document.getElementById('tabela-dados');
        
        if (dados.length === 0) {
            tabelaDiv.innerHTML = `
                <div class="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-100">
                    <i class="fas fa-folder-open text-4xl text-gray-300 mb-3"></i>
                    <p class="text-gray-500 font-medium">Nenhum registro encontrado.</p>
                    <p class="text-gray-400 text-sm">Tente ajustar os filtros acima.</p>
                </div>`;
            return;
        }

        let html = `
            <div class="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg bg-white">
                <table class="min-w-full divide-y divide-gray-300">
                    <thead class="bg-gray-50">
                        <tr>
                            <th scope="col" class="py-3.5 pl-4 pr-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 sm:pl-6">Data</th>
                            <th scope="col" class="px-3 py-3.5 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Assistente</th>
                            <th scope="col" class="px-3 py-3.5 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Empresa</th>
                            <th scope="col" class="px-3 py-3.5 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Documento</th>
                            <th scope="col" class="px-3 py-3.5 text-center text-xs font-bold uppercase tracking-wide text-gray-500">Status</th>
                            <th scope="col" class="px-3 py-3.5 text-center text-xs font-bold uppercase tracking-wide text-gray-500">% Assert.</th>
                            <th scope="col" class="px-3 py-3.5 text-center text-xs font-bold uppercase tracking-wide text-gray-500">OK / NOK</th>
                            <th scope="col" class="relative py-3.5 pl-3 pr-4 sm:pr-6">
                                <span class="sr-only">Ações</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 bg-white">
        `;

        dados.forEach(item => {
            let statusClass = 'bg-gray-100 text-gray-800';
            const st = (item.status || '').toUpperCase();
            if (st === 'OK' || st === 'VALIDO') statusClass = 'bg-green-100 text-green-800 border border-green-200';
            else if (st === 'NOK' || st.includes('NOK')) statusClass = 'bg-red-100 text-red-800 border border-red-200';
            else if (st.includes('REV')) statusClass = 'bg-yellow-100 text-yellow-800 border border-yellow-200';

            const dataFormatada = item.data_referencia ? item.data_referencia.split('-').reverse().join('/') : '-';
            const porcentagem = item.porcentagem_assertividade || '0,00%';
            
            // Tratamento de cor da porcentagem
            let corPorc = "text-gray-600";
            const valP = parseFloat(porcentagem.replace('%','').replace(',','.'));
            if(valP >= 99) corPorc = "text-green-600 font-bold";
            else if(valP < 90) corPorc = "text-red-600 font-bold";

            html += `
                <tr class="hover:bg-gray-50 transition-colors duration-150">
                    <td class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">${dataFormatada}</td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-600">${Sistema.escapar(item.assistente_nome)}</td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-600">${Sistema.escapar(item.empresa_nome)}</td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500" title="${Sistema.escapar(item.doc_name)}">
                        ${Sistema.escapar(item.doc_name).substring(0, 30)}${item.doc_name && item.doc_name.length > 30 ? '...' : ''}
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-center">
                        <span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${statusClass}">
                            ${item.status}
                        </span>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-center ${corPorc}">${porcentagem}</td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-center text-gray-500">
                        <span class="text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded">${item.qtd_ok || 0}</span> 
                        <span class="text-gray-300 mx-1">|</span>
                        <span class="text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded">${item.qtd_nok || 0}</span>
                    </td>
                    <td class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <button class="text-indigo-600 hover:text-indigo-900 font-semibold text-xs border border-indigo-200 px-3 py-1 rounded hover:bg-indigo-50" 
                                onclick="alert('Detalhes ID: ${item.id}')">
                            Detalhes
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table></div>`;
        tabelaDiv.innerHTML = html;
    }
};