Produtividade.Matriz = {
    initialized: false,
    
    init: function() {
        if (!this.initialized) {
            this.initialized = true;
        }
        // Garante que carrega ao iniciar
        this.carregar();
    },

    carregar: async function() {
        const tbody = document.getElementById('matriz-body');
        
        // Proteção: Se a tabela não existir no HTML, para aqui.
        if (!tbody) return;

        const dateInput = document.getElementById('global-date');
        
        // Pega o ano do filtro global (ou ano atual se vazio)
        let ano = new Date().getFullYear();
        if(dateInput && dateInput.value) {
            ano = parseInt(dateInput.value.split('-')[0]);
        }

        tbody.innerHTML = '<tr><td colspan="20" class="text-center py-12 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Buscando dados...</td></tr>';

        const dataInicio = `${ano}-01-01`;
        const dataFim = `${ano}-12-31`;

        try {
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select(`
                    quantidade, data_referencia,
                    usuario:usuarios ( id, nome, perfil, funcao, contrato )
                `)
                .gte('data_referencia', dataInicio)
                .lte('data_referencia', dataFim);

            if (error) throw error;

            // --- CORREÇÃO AQUI ---
            // Verifica se o checkbox existe. Se não existir, assume false (não mostrar).
            const checkGestao = document.getElementById('check-gestao');
            const mostrarGestao = checkGestao ? checkGestao.checked : false;

            const users = {};

            data.forEach(r => {
                // 1. Proteção contra Usuário Deletado (Null)
                // Se r.usuario for null, pula esse registro para não travar a tela
                if (!r.usuario) return;

                const uid = r.usuario.id;
                const nome = r.usuario.nome || 'Sem Nome'; // Fallback para nome
                const cargo = r.usuario.funcao ? String(r.usuario.funcao).toUpperCase() : 'ASSISTENTE';
                
                // 2. Filtro de Gestão (Blindado)
                if (!mostrarGestao) {
                    if (['AUDITORA', 'GESTORA', 'COORDENADORA'].includes(cargo)) return;
                }

                if (!users[uid]) {
                    users[uid] = {
                        nome: nome,
                        cargo: cargo,
                        contrato: r.usuario.contrato || 'PJ',
                        months: new Array(12).fill(0)
                    };
                }

                const partes = r.data_referencia.split('-');
                const mesIndex = parseInt(partes[1]) - 1; 

                if (mesIndex >= 0 && mesIndex <= 11) {
                    users[uid].months[mesIndex] += (Number(r.quantidade) || 0);
                }
            });

            const listaUsers = Object.values(users).sort((a, b) => a.nome.localeCompare(b.nome));
            this.renderizar(listaUsers, tbody);

        } catch (err) {
            console.error("Erro na Matriz:", err);
            tbody.innerHTML = `<tr><td colspan="20" class="text-center py-4 text-red-500">Erro ao carregar: ${err.message}</td></tr>`;
        }
    },

    renderizar: function(lista, tbody) {
        if(!tbody) return;
        tbody.innerHTML = '';

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="20" class="text-center py-12 text-slate-400 italic">Nenhum dado encontrado para os filtros atuais.</td></tr>';
            return;
        }

        const format = (n) => n === 0 ? '-' : Math.round(n).toLocaleString('pt-BR');
        
        lista.forEach(u => {
            const m = u.months;
            
            // Cálculos Agregados
            const q1 = m[0] + m[1] + m[2];
            const q2 = m[3] + m[4] + m[5];
            const q3 = m[6] + m[7] + m[8];
            const q4 = m[9] + m[10] + m[11];
            
            const s1 = q1 + q2;
            const s2 = q3 + q4;
            
            const total = s1 + s2;

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition odd:bg-white even:bg-slate-50/30 group border-b border-slate-100 last:border-0";
            
            // Colunas de Estilo
            const tdNome = "px-4 py-3 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]";
            const tdMes = "px-3 py-3 text-center text-slate-600 border-r border-slate-100 text-xs";
            const tdQ = "px-3 py-3 text-center font-bold text-blue-700 bg-blue-50/30 border-r border-blue-100 text-xs";
            const tdS = "px-3 py-3 text-center font-bold text-indigo-700 bg-indigo-50/30 border-r border-indigo-100 text-xs";
            const tdTotal = "px-4 py-3 text-center font-black text-slate-800 bg-slate-100 text-xs";

            tr.innerHTML = `
                <td class="${tdNome}">
                    <div class="flex flex-col">
                        <span class="font-bold text-slate-700 text-xs truncate max-w-[180px]" title="${u.nome}">${u.nome}</span>
                        <span class="text-[9px] text-slate-400 uppercase tracking-tight">${u.cargo} • ${u.contrato}</span>
                    </div>
                </td>
                
                <td class="${tdMes}">${format(m[0])}</td>
                <td class="${tdMes}">${format(m[1])}</td>
                <td class="${tdMes}">${format(m[2])}</td>
                <td class="${tdQ}">${format(q1)}</td>
                
                <td class="${tdMes}">${format(m[3])}</td>
                <td class="${tdMes}">${format(m[4])}</td>
                <td class="${tdMes}">${format(m[5])}</td>
                <td class="${tdQ}">${format(q2)}</td>
                
                <td class="${tdS}">${format(s1)}</td>
                
                <td class="${tdMes}">${format(m[6])}</td>
                <td class="${tdMes}">${format(m[7])}</td>
                <td class="${tdMes}">${format(m[8])}</td>
                <td class="${tdQ}">${format(q3)}</td>
                
                <td class="${tdMes}">${format(m[9])}</td>
                <td class="${tdMes}">${format(m[10])}</td>
                <td class="${tdMes}">${format(m[11])}</td>
                <td class="${tdQ}">${format(q4)}</td>
                
                <td class="${tdS}">${format(s2)}</td>
                
                <td class="${tdTotal}">${format(total)}</td>
            `;
            tbody.appendChild(tr);
        });
    }
};