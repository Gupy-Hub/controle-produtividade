const Matriz = {
    initialized: false,
    cacheDados: {}, // Armazena dados por ano para não recarregar

    init: function() { 
        if(!this.initialized) { 
            // Se mudar a data no input, forçamos o recarregamento (true)
            Sistema.Datas.criarInputInteligente('data-matriz', KEY_DATA_GLOBAL, () => { this.carregar(true); }); 
            this.initialized = true; 
        } 
        // Ao trocar de aba, não força recarregamento (false), usa cache se existir
        setTimeout(() => this.carregar(false), 50);
    },
    
    carregar: async function(forcar = false) {
        const tbody = document.getElementById('matriz-body'); 
        
        // --- CORREÇÃO DE DATA (Igual ao Performance) ---
        let dataObj = Sistema.Datas.lerInput('data-matriz');
        // Se a data for inválida ou nula, assume hoje para evitar erros
        if (!dataObj || isNaN(dataObj.getTime())) dataObj = new Date();
        
        const ano = dataObj.getFullYear();
        // -----------------------------------------------

        // --- CACHE: Se já temos dados deste ano e não é para forçar, exibe direto ---
        if (!forcar && this.cacheDados[ano]) {
            this.renderizar(this.cacheDados[ano]);
            return;
        }

        if(tbody) tbody.innerHTML = '<tr><td colspan="20" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando Matriz...</td></tr>';
        
        try {
            // Chama a função SQL otimizada (que criamos nos passos anteriores)
            const { data: dadosAgrupados, error } = await _supabase.rpc('get_matriz_dados', { ano_ref: ano });
            
            if(error) throw error;
            
            // Salva no cache
            this.cacheDados[ano] = dadosAgrupados || [];
            this.renderizar(this.cacheDados[ano]);
            
        } catch(e) { 
            console.error(e);
            if(tbody) tbody.innerHTML = '<tr><td colspan="20" class="text-center py-4 text-red-500">Erro ao carregar. Verifique a conexão.</td></tr>';
        }
    },

    // Nova função separada para desenhar a tabela
    renderizar: function(listaDados) {
        const tbody = document.getElementById('matriz-body'); 
        if (!tbody) return; // Segurança extra caso mude de aba rápido

        let map = {};
        if(listaDados) {
            listaDados.forEach(item => {
                const nome = item.nome_assistente;
                // Garante que o mês é numérico e ajusta para índice 0-11
                const mesVal = Number(item.mes);
                const mesIndex = (isNaN(mesVal) ? 1 : mesVal) - 1; 
                const qtd = Number(item.total_quantidade) || 0;

                if (!map[nome]) {
                    map[nome] = { nome: nome, m: Array(12).fill(0), t: 0 };
                }
                
                // Segurança para não estourar o array se vier mês 13 ou inválido
                if (mesIndex >= 0 && mesIndex < 12) {
                    map[nome].m[mesIndex] = qtd;
                }
                map[nome].t += qtd;
            });
        }

        const lista = Object.values(map).sort((a, b) => b.t - a.t);
        let html = '';
        
        if(lista.length === 0) {
            html = '<tr><td colspan="20" class="text-center py-8 text-slate-400">Nenhum dado encontrado para este ano.</td></tr>';
        } else {
            lista.forEach(u => {
                const q1 = u.m[0]+u.m[1]+u.m[2]; const q2 = u.m[3]+u.m[4]+u.m[5]; const s1 = q1+q2; 
                const q3 = u.m[6]+u.m[7]+u.m[8]; const q4 = u.m[9]+u.m[10]+u.m[11]; const s2 = q3+q4; 
                const cell = (v) => v ? v.toLocaleString() : '-';
                
                // Gera a linha HTML
                html += `<tr class="hover:bg-slate-50 border-b border-slate-100 text-slate-600">
                    <td class="px-4 py-3 font-bold text-slate-700 sticky left-0 bg-white border-r border-slate-200 z-10">${u.nome}</td>
                    <td class="px-2 py-3 text-center">${cell(u.m[0])}</td>
                    <td class="px-2 py-3 text-center">${cell(u.m[1])}</td>
                    <td class="px-2 py-3 text-center">${cell(u.m[2])}</td>
                    <td class="col-tri bg-slate-50 font-semibold text-slate-700 border-x border-slate-200 text-center">${cell(q1)}</td>
                    <td class="px-2 py-3 text-center">${cell(u.m[3])}</td>
                    <td class="px-2 py-3 text-center">${cell(u.m[4])}</td>
                    <td class="px-2 py-3 text-center">${cell(u.m[5])}</td>
                    <td class="col-tri bg-slate-50 font-semibold text-slate-700 border-x border-slate-200 text-center">${cell(q2)}</td>
                    <td class="col-sem bg-blue-50 font-bold text-blue-800 border-x border-blue-100 text-center">${cell(s1)}</td>
                    <td class="px-2 py-3 text-center">${cell(u.m[6])}</td>
                    <td class="px-2 py-3 text-center">${cell(u.m[7])}</td>
                    <td class="px-2 py-3 text-center">${cell(u.m[8])}</td>
                    <td class="col-tri bg-slate-50 font-semibold text-slate-700 border-x border-slate-200 text-center">${cell(q3)}</td>
                    <td class="px-2 py-3 text-center">${cell(u.m[9])}</td>
                    <td class="px-2 py-3 text-center">${cell(u.m[10])}</td>
                    <td class="px-2 py-3 text-center">${cell(u.m[11])}</td>
                    <td class="col-tri bg-slate-50 font-semibold text-slate-700 border-x border-slate-200 text-center">${cell(q4)}</td>
                    <td class="col-sem bg-blue-50 font-bold text-blue-800 border-x border-blue-100 text-center">${cell(s2)}</td>
                    <td class="col-ano bg-indigo-100 font-bold text-indigo-900 border-l border-indigo-200 text-center">${u.t.toLocaleString()}</td>
                </tr>`;
            });
        }
        tbody.innerHTML = html;
    }
};