window.Produtividade = window.Produtividade || {};

Produtividade.Matriz = {
    
    carregarMatriz: async function() {
        const tbody = document.getElementById('matriz-body');
        const dateInput = document.getElementById('global-date').value;
        
        if (!tbody) return;

        // Pega o ano da data selecionada (ou ano atual)
        let ano = new Date().getFullYear();
        if (dateInput) {
            ano = parseInt(dateInput.split('-')[0]);
        }

        tbody.innerHTML = '<tr><td colspan="19" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando Matriz Anual de ' + ano + '...</td></tr>';

        try {
            // Busca dados do ANO INTEIRO
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select(`
                    quantidade, data_referencia,
                    usuario:usuarios ( id, nome, cargo, perfil )
                `)
                .gte('data_referencia', `${ano}-01-01`)
                .lte('data_referencia', `${ano}-12-31`);

            if (error) throw error;

            // Estrutura de dados para processamento
            // Mapa: UsuarioID -> { nome, dados: { 1: qtd, 2: qtd ... 12: qtd } }
            const matriz = {};

            data.forEach(r => {
                // Filtra Auditoras/Gestoras da Matriz se desejar (opcional, aqui mantive todos para visão geral)
                // Se quiser filtrar, descomente:
                // const cargo = r.usuario.cargo ? r.usuario.cargo.toUpperCase() : '';
                // if (cargo === 'AUDITORA' || cargo === 'GESTORA') return;

                const uid = r.usuario.id;
                if (!matriz[uid]) {
                    matriz[uid] = {
                        nome: r.usuario.nome || 'Desconhecido',
                        cargo: r.usuario.cargo || 'Assistente',
                        perfil: r.usuario.perfil || 'PJ',
                        meses: Array(13).fill(0) // Índices 1 a 12
                    };
                }

                const mes = parseInt(r.data_referencia.split('-')[1]); // '2026-01-05' -> 01
                const qtd = Number(r.quantidade) || 0;
                
                matriz[uid].meses[mes] += qtd;
            });

            // Converte para array e ordena por nome
            const lista = Object.values(matriz).sort((a, b) => a.nome.localeCompare(b.nome));

            tbody.innerHTML = '';

            lista.forEach(u => {
                // Cálculos de Trimestres e Semestres
                const t1 = u.meses[1] + u.meses[2] + u.meses[3];
                const t2 = u.meses[4] + u.meses[5] + u.meses[6];
                const t3 = u.meses[7] + u.meses[8] + u.meses[9];
                const t4 = u.meses[10] + u.meses[11] + u.meses[12];

                const s1 = t1 + t2;
                const s2 = t3 + t4;
                
                const total = s1 + s2;

                // Formatação
                const fmt = (n) => n > 0 ? Math.round(n).toLocaleString('pt-BR') : '-';
                
                // Estilo da linha
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50 transition border-b border-slate-100 last:border-0 text-xs";
                
                let iconCargo = '';
                if(String(u.cargo).toUpperCase() === 'AUDITORA') iconCargo = '<i class="fas fa-star text-purple-400 ml-1 text-[8px]" title="Auditora"></i>';

                tr.innerHTML = `
                    <td class="px-4 py-3 font-bold text-slate-700 sticky left-0 bg-white border-r border-slate-200 truncate max-w-[150px]" title="${u.nome}">
                        ${u.nome} ${iconCargo}
                    </td>
                    
                    <td class="px-3 py-3 text-center text-slate-500">${fmt(u.meses[1])}</td>
                    <td class="px-3 py-3 text-center text-slate-500">${fmt(u.meses[2])}</td>
                    <td class="px-3 py-3 text-center text-slate-500">${fmt(u.meses[3])}</td>
                    
                    <td class="px-3 py-3 text-center font-bold text-blue-700 bg-blue-50/50 border-x border-blue-100">${fmt(t1)}</td>
                    
                    <td class="px-3 py-3 text-center text-slate-500">${fmt(u.meses[4])}</td>
                    <td class="px-3 py-3 text-center text-slate-500">${fmt(u.meses[5])}</td>
                    <td class="px-3 py-3 text-center text-slate-500">${fmt(u.meses[6])}</td>
                    
                    <td class="px-3 py-3 text-center font-bold text-blue-700 bg-blue-50/50 border-x border-blue-100">${fmt(t2)}</td>
                    
                    <td class="px-3 py-3 text-center font-black text-indigo-700 bg-indigo-50/50 border-r border-indigo-100">${fmt(s1)}</td>
                    
                    <td class="px-3 py-3 text-center text-slate-500">${fmt(u.meses[7])}</td>
                    <td class="px-3 py-3 text-center text-slate-500">${fmt(u.meses[8])}</td>
                    <td class="px-3 py-3 text-center text-slate-500">${fmt(u.meses[9])}</td>
                    
                    <td class="px-3 py-3 text-center font-bold text-blue-700 bg-blue-50/50 border-x border-blue-100">${fmt(t3)}</td>
                    
                    <td class="px-3 py-3 text-center text-slate-500">${fmt(u.meses[10])}</td>
                    <td class="px-3 py-3 text-center text-slate-500">${fmt(u.meses[11])}</td>
                    <td class="px-3 py-3 text-center text-slate-500">${fmt(u.meses[12])}</td>
                    
                    <td class="px-3 py-3 text-center font-bold text-blue-700 bg-blue-50/50 border-x border-blue-100">${fmt(t4)}</td>
                    
                    <td class="px-3 py-3 text-center font-black text-indigo-700 bg-indigo-50/50 border-r border-indigo-100">${fmt(s2)}</td>
                    
                    <td class="px-4 py-3 text-center font-black text-slate-800 bg-slate-100">${fmt(total)}</td>
                `;
                tbody.appendChild(tr);
            });

            if (lista.length === 0) {
                tbody.innerHTML = '<tr><td colspan="19" class="text-center py-10 text-slate-400">Nenhum dado encontrado para o ano de ' + ano + '.</td></tr>';
            }

        } catch (err) {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="19" class="text-center py-4 text-red-500">Erro: ${err.message}</td></tr>`;
        }
    }
};