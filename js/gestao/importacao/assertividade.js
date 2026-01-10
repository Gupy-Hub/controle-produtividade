Gestao.Assertividade = {
    timerBusca: null, // Controla o tempo de digitação

    // --- CARREGAMENTO INICIAL (Últimos 30 dias para ser rápido) ---
    carregar: async function() {
        const tbody = document.getElementById('lista-assertividade');
        const searchInput = document.getElementById('search-assert');
        
        // Se já tiver algo digitado na busca, prioriza a busca em vez do carregamento padrão
        if (searchInput && searchInput.value.trim().length > 0) {
            this.buscar(searchInput.value);
            return;
        }

        if (tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12"><i class="fas fa-spinner fa-spin text-purple-500 text-2xl"></i><p class="text-slate-400 mt-2">Carregando auditorias recentes...</p></td></tr>';

        try {
            // Pega data de 30 dias atrás
            const dataLimite = new Date();
            dataLimite.setDate(dataLimite.getDate() - 30);
            const dataIso = dataLimite.toISOString().split('T')[0];

            // Traz apenas os mais recentes para a tela inicial abrir rápido
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select('*, usuarios!inner(nome)') // !inner garante que traga o nome
                .gte('data_referencia', dataIso)
                .order('data_referencia', { ascending: false })
                .order('hora', { ascending: false })
                .limit(500);

            if (error) throw error;

            this.renderizarTabela(data || [], "Exibindo registros dos últimos 30 dias");

        } catch (e) {
            console.error(e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="11" class="text-center py-8 text-red-500">Erro de conexão: ${e.message}</td></tr>`;
        }
    },

    // --- BUSCA INTELIGENTE NO SERVIDOR (Acionada ao digitar) ---
    filtrar: function() {
        const termo = document.getElementById('search-assert').value.trim();
        
        // Limpa o timer anterior para não buscar a cada letra (espera parar de digitar)
        clearTimeout(this.timerBusca);

        if (termo.length === 0) {
            // Se limpou a busca, recarrega o padrão
            this.carregar();
            return;
        }

        // Aguarda 600ms após parar de digitar para ir ao banco
        this.timerBusca = setTimeout(() => {
            this.executarBuscaNoBanco(termo);
        }, 600);
    },

    executarBuscaNoBanco: async function(termo) {
        const tbody = document.getElementById('lista-assertividade');
        tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12"><i class="fas fa-circle-notch fa-spin text-blue-500 text-2xl"></i><p class="text-slate-400 mt-2">Buscando em todo o histórico...</p></td></tr>';

        try {
            let dadosFinais = [];

            // ESTRATÉGIA DE BUSCA:
            // 1. Primeiro buscamos IDs de usuários que tenham esse nome
            const { data: users } = await Sistema.supabase
                .from('usuarios')
                .select('id')
                .ilike('nome', `%${termo}%`);
            
            const userIds = users ? users.map(u => u.id) : [];

            // 2. Monta a consulta principal
            let query = Sistema.supabase
                .from('producao')
                .select('*, usuarios!inner(nome)')
                .order('data_referencia', { ascending: false })
                .limit(200); // Limite de resultados da busca

            // 3. Aplica filtros (OR logic)
            // Se encontrou usuários com esse nome, busca pelos IDs DELES OU pelo texto em outras colunas
            if (userIds.length > 0) {
                // Busca: (ID do usuário está na lista) OU (Empresa parece termo) OU (Obs parece termo)
                // Sintaxe do Supabase para OR com IN é chata, vamos simplificar:
                // Se achou user, foca neles. Se não, busca texto geral.
                
                // Opção Híbrida robusta:
                const filtrosTexto = `empresa.ilike.%${termo}%,observacao.ilike.%${termo}%,nome_documento.ilike.%${termo}%`;
                const filtroUser = `usuario_id.in.(${userIds.join(',')})`;
                
                query = query.or(`${filtroUser},${filtrosTexto}`);
            } else {
                // Se não achou usuário com esse nome, busca só nos campos de texto e ID direto
                let filtros = `empresa.ilike.%${termo}%,observacao.ilike.%${termo}%,nome_documento.ilike.%${termo}%`;
                
                // Se o termo for um número, tenta buscar por ID do assistente ou ID da produção
                if (!isNaN(termo)) {
                    filtros += `,usuario_id.eq.${termo}`;
                }
                
                query = query.or(filtros);
            }

            const { data, error } = await query;
            if (error) throw error;

            this.renderizarTabela(data || [], `Resultados para: "${termo}"`);

        } catch (e) {
            console.error(e);
            tbody.innerHTML = `<tr><td colspan="11" class="text-center py-8 text-red-500">Erro na busca: ${e.message}</td></tr>`;
        }
    },

    renderizarTabela: function(lista, mensagemRodape = "") {
        const tbody = document.getElementById('lista-assertividade');
        const contador = document.getElementById('contador-assert');
        
        // Atualiza a mensagem de rodapé (ao lado do contador) se existir um elemento para isso
        // Se não tiver, criamos um span dinâmico no contador
        if(contador) {
             contador.innerHTML = `<strong>${lista.length}</strong> <span class="text-xs font-normal text-slate-400 ml-2">(${mensagemRodape})</span>`;
        }

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-slate-400"><div class="flex flex-col items-center gap-2"><i class="fas fa-search text-3xl opacity-20"></i><span>Nenhum registro encontrado no histórico.</span></div></td></tr>';
            return;
        }

        let html = '';
        lista.forEach(item => {
            const dataFmt = item.data_referencia ? item.data_referencia.split('-').reverse().slice(0,2).join('/') : '-';
            const horaFmt = item.hora ? item.hora.substring(0, 5) : '';
            const nomeUser = item.usuarios?.nome || `ID: ${item.usuario_id}`;
            
            // Badge Status
            let statusBadge = `<span class="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">${item.status || '-'}</span>`;
            const stUpper = (item.status||'').toUpperCase();
            if (stUpper === 'OK' || stUpper === 'VALIDO') statusBadge = `<span class="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 font-bold">OK</span>`;
            else if (stUpper.includes('NOK') || stUpper.includes('INV')) statusBadge = `<span class="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200 font-bold">${item.status}</span>`;
            else if (stUpper.includes('JUST')) statusBadge = `<span class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200 font-bold">JUST</span>`;

            // Cor Assertividade
            // Tenta limpar a string para pegar número (ex: "97.5%" -> 97.5)
            let assertVal = 0;
            if(item.assertividade) {
                assertVal = parseFloat(String(item.assertividade).replace('%','').replace(',','.'));
            }
            
            let assertColor = 'text-slate-600';
            if (assertVal >= 100) assertColor = 'text-emerald-600 font-bold';
            else if (assertVal > 0 && assertVal < 90) assertColor = 'text-rose-600 font-bold';

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-xs whitespace-nowrap">
                <td class="px-3 py-2 text-slate-500 font-mono">${dataFmt} <span class="text-[10px] text-slate-300 ml-1">${horaFmt}</span></td>
                <td class="px-3 py-2 font-bold text-slate-700 max-w-[150px] truncate" title="${item.empresa}">${item.empresa || '-'}</td>
                <td class="px-3 py-2 text-slate-600 max-w-[150px] truncate" title="${nomeUser}">${nomeUser}</td>
                <td class="px-3 py-2 text-slate-500 max-w-[150px] truncate" title="${item.nome_documento}">${item.nome_documento || '-'}</td>
                <td class="px-3 py-2 text-center text-[10px]">${statusBadge}</td>
                <td class="px-3 py-2 text-slate-500 max-w-[200px] truncate cursor-help" title="${item.observacao}">${item.observacao || '-'}</td>
                <td class="px-3 py-2 text-center text-slate-400">${item.num_campos || 0}</td>
                <td class="px-3 py-2 text-center text-emerald-600 font-bold">${item.qtd_ok || 0}</td>
                <td class="px-3 py-2 text-center text-rose-600 font-bold">${item.nok || 0}</td>
                <td class="px-3 py-2 text-center ${assertColor}">${item.assertividade || '-'}</td>
                <td class="px-3 py-2 text-slate-500 italic text-[10px]">${item.auditora || '-'}</td>
            </tr>`;
        });

        tbody.innerHTML = html;
    }
};