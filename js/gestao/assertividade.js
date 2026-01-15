/**
 * NEXUS OPERACIONAL: Visualização de Dados
 */
Gestao.Assertividade = {
    async buscarDados() {
        const { data, error } = await Sistema.supabase
            .from('assertividade')
            .select(`
                id, data_referencia, empresa_nome, nome_assistente, 
                nome_documento, status, qtd_ok, qtd_nok, porcentagem
            `)
            .order('data_referencia', { ascending: false });

        if (error) return console.error("Erro ao carregar:", error);
        this.renderizarTabela(data);
    },

    renderizarTabela(lista) {
        const corpo = document.getElementById('tabela-assertividade-body');
        if (!corpo) return;

        corpo.innerHTML = lista.map(item => `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-2">${item.data_referencia}</td>
                <td class="px-4 py-2 font-medium">${item.empresa_nome || 'N/A'}</td>
                <td class="px-4 py-2">${item.nome_assistente}</td>
                <td class="px-4 py-2 text-sm">${item.nome_documento}</td>
                <td class="px-4 py-2">
                    <span class="px-2 py-1 rounded text-xs ${item.status === 'OK' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                        ${item.status}
                    </span>
                </td>
                <td class="px-4 py-2 text-center">${item.porcentagem}%</td>
            </tr>
        `).join('');
    }
};