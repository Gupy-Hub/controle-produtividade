window.Gestao = window.Gestao || {};

Gestao.Assertividade = {
    filtros: {
        busca: '',
        data: new Date().toISOString().split('T')[0] // Hoje padrão
    },

    init: function() {
        this.renderizarFiltros();
        this.carregar();
    },

    renderizarFiltros: function() {
        const container = document.getElementById('filtros-dinamicos');
        if (!container) return;

        container.innerHTML = `
            <div class="flex gap-4 items-end">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Data Referência</label>
                    <input type="date" id="filtro-data" value="${this.filtros.data}" 
                        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                </div>
                <div class="flex-1">
                    <label class="block text-sm font-medium text-gray-700">Buscar Assistente/Empresa</label>
                    <input type="text" id="filtro-busca" placeholder="Digite para buscar..." 
                        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                </div>
                <button id="btn-atualizar" class="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">
                    <i class="fas fa-sync-alt"></i> Atualizar
                </button>
            </div>
        `;

        document.getElementById('filtro-data').addEventListener('change', (e) => {
            this.filtros.data = e.target.value;
            this.carregar();
        });

        document.getElementById('filtro-busca').addEventListener('input', (e) => {
            this.filtros.busca = e.target.value;
            // Debounce simples para não chamar o banco a cada letra
            clearTimeout(this._timerBusca);
            this._timerBusca = setTimeout(() => this.carregar(), 500);
        });

        document.getElementById('btn-atualizar').addEventListener('click', () => this.carregar());
    },

    carregar: async function() {
        const tabelaDiv = document.getElementById('tabela-dados');
        if (!tabelaDiv) return;

        tabelaDiv.innerHTML = '<div class="text-center p-10"><i class="fas fa-spinner fa-spin fa-2x text-indigo-600"></i><p class="mt-2">Carregando dados...</p></div>';

        try {
            const dados = await this.buscarDados();
            this.renderizarTabela(dados);
        } catch (error) {
            console.error("Erro ao carregar:", error);
            tabelaDiv.innerHTML = `<div class="text-red-600 p-4">Erro ao carregar dados: ${error.message}</div>`;
        }
    },

    buscarDados: async function() {
        // --- QUERY OTIMIZADA PARA O NOVO BANCO ---
        let query = Sistema.supabase
            .from('vw_assertividade_completa') // Lê da View
            .select('*')
            .order('data_referencia', { ascending: false })
            .order('id', { ascending: false })
            .limit(100); // Limite de segurança para performance

        // Filtro de Data
        if (this.filtros.data) {
            query = query.eq('data_referencia', this.filtros.data);
        }

        // Filtro de Busca (Nome ou Empresa)
        if (this.filtros.busca) {
            const termo = `%${this.filtros.busca}%`;
            // Sintaxe do Supabase para OR: busca no assistente OU empresa
            query = query.or(`assistente_nome.ilike.${termo},empresa_nome.ilike.${termo}`);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data || [];
    },

    renderizarTabela: function(dados) {
        const tabelaDiv = document.getElementById('tabela-dados');
        
        if (dados.length === 0) {
            tabelaDiv.innerHTML = `
                <div class="text-center py-10 bg-gray-50 rounded-lg">
                    <p class="text-gray-500">Nenhum registro encontrado para esta data/filtro.</p>
                </div>`;
            return;
        }

        // Cabeçalho da Tabela
        let html = `
            <div class="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                <table class="min-w-full divide-y divide-gray-300">
                    <thead class="bg-gray-50">
                        <tr>
                            <th scope="col" class="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Data</th>
                            <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Assistente</th>
                            <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Empresa</th>
                            <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Documento</th>
                            <th scope="col" class="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">Status</th>
                            <th scope="col" class="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">Assertividade</th>
                            <th scope="col" class="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">OK / NOK</th>
                            <th scope="col" class="relative py-3.5 pl-3 pr-4 sm:pr-6">
                                <span class="sr-only">Ações</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 bg-white">
        `;

        // Linhas da Tabela
        dados.forEach(item => {
            // Tratamento de cores para o Status
            let statusClass = 'bg-gray-100 text-gray-800';
            if (item.status === 'OK') statusClass = 'bg-green-100 text-green-800';
            else if (item.status === 'NOK') statusClass = 'bg-red-100 text-red-800';
            else if (item.status === 'REV') statusClass = 'bg-yellow-100 text-yellow-800';

            // Tratamento da data para exibição (DD/MM/AAAA)
            const dataFormatada = item.data_referencia ? item.data_referencia.split('-').reverse().join('/') : '-';

            // Tratamento da porcentagem (já vem como texto "100,00%" do banco)
            const porcentagem = item.porcentagem_assertividade || '0,00%';
            
            html += `
                <tr>
                    <td class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">${dataFormatada}</td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">${Sistema.escapar(item.assistente_nome)}</td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">${Sistema.escapar(item.empresa_nome)}</td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500" title="${Sistema.escapar(item.doc_name)}">
                        ${Sistema.escapar(item.doc_name).substring(0, 25)}${item.doc_name.length > 25 ? '...' : ''}
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-center">
                        <span class="inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${statusClass}">
                            ${item.status}
                        </span>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-center font-bold text-gray-700">${porcentagem}</td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-center text-gray-500">
                        <span class="text-green-600 font-bold">${item.qtd_ok || 0}</span> / 
                        <span class="text-red-600 font-bold">${item.qtd_nok || 0}</span>
                    </td>
                    <td class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <button onclick="Gestao.Assertividade.verDetalhes(${item.id})" class="text-indigo-600 hover:text-indigo-900">Ver</button>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table></div>`;
        tabelaDiv.innerHTML = html;
    },

    verDetalhes: function(id) {
        alert("Funcionalidade de detalhes em construção para o ID: " + id);
        // Aqui futuramente podemos abrir um modal
    }
};