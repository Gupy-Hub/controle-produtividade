const Perf = {
    selectedUserId: null,
    dadosCarregados: [],
    initialized: false,
    cacheFiltros: null, // Armazena a última busca para evitar reload ao trocar de aba

    init: function() { 
        if(!this.initialized) {
            this.uiChange();
            this.initialized = true;
        }
    },

    // Sincroniza a data quando o usuário altera em outras abas
    syncData: function(dataString) {
        const [ano, mes] = dataString.split('-').map(Number);
        const inpMonth = document.getElementById('perf-input-month');
        const inpYear = document.getElementById('perf-input-year');
        
        if(inpMonth) inpMonth.value = `${ano}-${String(mes).padStart(2,'0')}`;
        if(inpYear) inpYear.value = ano;
        
        this.carregarRanking(true); // Força recarregamento pois a data mudou externa mente
    },

    uiChange: function() {
        const tipo = document.getElementById('perf-period-type').value;
        const inputs = {
            mes: document.getElementById('perf-input-month'),
            trim: document.getElementById('perf-input-quarter'),
            sem: document.getElementById('perf-input-semester'),
            ano: document.getElementById('perf-input-year')
        };

        // Esconde todos
        Object.values(inputs).forEach(el => el && el.classList.add('hidden'));

        // Mostra os relevantes
        if (tipo === 'mes') inputs.mes.classList.remove('hidden');
        else if (tipo === 'trimestre') { inputs.trim.classList.remove('hidden'); inputs.ano.classList.remove('hidden'); }
        else if (tipo === 'semestre') { inputs.sem.classList.remove('hidden'); inputs.ano.classList.remove('hidden'); }
        else if (tipo === 'ano') inputs.ano.classList.remove('hidden');
        
        this.carregarRanking(); 
    },

    carregarRanking: async function(forcar = false) {
        const tbody = document.getElementById('perf-ranking-body'); 
        
        const tipo = document.getElementById('perf-period-type').value; 
        const valMonth = document.getElementById('perf-input-month').value; 
        const valYear = document.getElementById('perf-input-year').value;
        const valQuarter = document.getElementById('perf-input-quarter').value;
        const valSemester = document.getElementById('perf-input-semester').value;

        // Validação de inputs
        if((tipo === 'mes' && !valMonth) || (tipo !== 'mes' && !valYear)) return;

        // Gerar chave de cache baseada nos filtros atuais
        const queryKey = `${tipo}-${valMonth}-${valYear}-${valQuarter}-${valSemester}`;
        if(!forcar && this.cacheFiltros === queryKey && this.dadosCarregados.length > 0) {
            this.renderRanking();
            return;
        }

        if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando Ranking...</td></tr>';
        
        try {
            let s, e, labelTexto;
            let ano = parseInt(valYear);

            if (tipo === 'mes') { 
                const [y, m] = valMonth.split('-').map(Number);
                s = `${y}-${String(m).padStart(2,'0')}-01`; 
                e = `${y}-${String(m).padStart(2,'0')}-${new Date(y, m, 0).getDate()}`;
                labelTexto = `Mensal: ${m}/${y}`;
            } else if (tipo === 'trimestre') { 
                const q = parseInt(valQuarter);
                const mStart = ((q-1)*3)+1; 
                s = `${ano}-${String(mStart).padStart(2,'0')}-01`; 
                e = `${ano}-${String(mStart+2).padStart(2,'0')}-${new Date(ano, mStart+2, 0).getDate()}`;
                labelTexto = `${q}º Trimestre de ${ano}`;
            } else if (tipo === 'semestre') { 
                const sem = parseInt(valSemester);
                s = sem === 1 ? `${ano}-01-01` : `${ano}-07-01`; 
                e = sem === 1 ? `${ano}-06-30` : `${ano}-12-31`; 
                labelTexto = `${sem}º Semestre de ${ano}`;
            } else { 
                s = `${ano}-01-01`; e = `${ano}-12-31`; 
                labelTexto = `Ano de ${ano}`;
            }
            
            document.getElementById('perf-range-label').innerText = labelTexto;

            // Busca otimizada: apenas colunas necessárias
            const { data: prods, error } = await _supabase
                .from('producao')
                .select('usuario_id, data_referencia, quantidade')
                .gte('data_referencia', s)
                .lte('data_referencia', e); 
            
            if(error) throw error;
            
            let stats = {};
            let prodTotalGeral = 0, prodCLT = 0, prodPJ = 0;
            let namesCLT = new Set(), namesPJ = new Set();

            prods.forEach(item => {
                const user = USERS_CACHE[item.usuario_id];
                if (!user || user.funcao !== 'Assistente') return;

                const nome = user.nome.trim(); 
                const qtd = Number(item.quantidade) || 0;
                prodTotalGeral += qtd;
                
                if (user.contrato?.includes('CLT')) { prodCLT += qtd; namesCLT.add(nome); } 
                else { prodPJ += qtd; namesPJ.add(nome); }

                if (!stats[nome]) stats[nome] = { id: item.usuario_id, nome: nome, total: 0, dias: new Set() };
                stats[nome].total += qtd; 
                stats[nome].dias.add(item.data_referencia);
            });
            
            // Atualiza indicadores de segmentação
            const atualizarElemento = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
            atualizarElemento('perf-pct-clt', (prodTotalGeral > 0 ? Math.round((prodCLT / prodTotalGeral) * 100) : 0) + '%');
            atualizarElemento('perf-count-clt', namesCLT.size);
            atualizarElemento('perf-pct-pj', (prodTotalGeral > 0 ? Math.round((prodPJ / prodTotalGeral) * 100) : 0) + '%');
            atualizarElemento('perf-count-pj', namesPJ.size);

            this.dadosCarregados = Object.values(stats).sort((a, b) => {
                const pctA = a.total / ((a.dias.size || 1) * 650);
                const pctB = b.total / ((b.dias.size || 1) * 650);
                return pctB - pctA; 
            });

            this.cacheFiltros = queryKey;
            this.renderRanking();
        } catch (err) { 
            console.error(err); 
            if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center text-red-400">Erro ao carregar dados.</td></tr>'; 
        }
    },

    renderRanking: function() {
        const tbody = document.getElementById('perf-ranking-body'); 
        if (!this.dadosCarregados.length) { 
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400">Nenhum dado encontrado.</td></tr>'; 
            this.atualizarCards(null); 
            return; 
        }
        
        let html = ''; 
        let selectedStats = null;
        
        this.dadosCarregados.forEach((u, idx) => {
            const dias = u.dias.size || 1; 
            const media = Math.round(u.total / dias); 
            const meta = 650 * dias; 
            const pct = Math.round((u.total / meta) * 100);
            const isSelected = this.selectedUserId === u.id; 
            if (isSelected) selectedStats = { ...u, media, meta, rank: idx + 1 };
            
            const isMe = sessao && u.nome === sessao.nome; 
            let rowClass = isSelected ? "selected-row" : (isMe ? "me-row" : "hover:bg-slate-50");
            let trofeu = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : ''));

            html += `
                <tr class="${rowClass} transition border-b border-slate-100 cursor-pointer" onclick="Perf.toggleUsuario(${u.id})">
                    <td class="px-6 py-4 font-bold text-slate-600">${trofeu} #${idx + 1}</td>
                    <td class="px-6 py-4 font-bold text-slate-800">${u.nome} ${isMe ? '(Você)' : ''}</td>
                    <td class="px-6 py-4 text-center font-bold text-blue-700">${u.total.toLocaleString()}</td>
                    <td class="px-6 py-4 text-center text-slate-500">${dias}</td>
                    <td class="px-6 py-4 text-center">${media.toLocaleString()}</td>
                    <td class="px-6 py-4 text-center text-slate-400">${meta.toLocaleString()}</td>
                    <td class="px-6 py-4 text-center">
                        <span class="${pct >= 100 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'} text-xs font-bold px-2 py-1 rounded-full">
                            ${pct}%
                        </span>
                    </td>
                </tr>`;
        });
        
        tbody.innerHTML = html; 
        this.atualizarCards(selectedStats);
    },

    toggleUsuario: function(id) { 
        this.selectedUserId = (this.selectedUserId === id) ? null : id; 
        const btnLimpar = document.getElementById('perf-btn-limpar');
        if(btnLimpar) btnLimpar.classList.toggle('hidden', !this.selectedUserId);
        this.renderRanking(); 
    },

    atualizarCards: function(userStats) {
        const total = userStats ? userStats.total : this.dadosCarregados.reduce((a, b) => a + b.total, 0);
        const meta = userStats ? userStats.meta : this.dadosCarregados.reduce((a, b) => a + (b.dias.size * 650), 0);
        const pct = meta > 0 ? Math.round((total / meta) * 100) : 0;

        document.getElementById('perf-card-total').innerText = total.toLocaleString();
        document.getElementById('perf-card-meta').innerText = meta.toLocaleString();
        document.getElementById('perf-card-pct-val').innerText = pct + '%';
        
        const cardPct = document.getElementById('perf-card-pct');
        if(cardPct) {
            cardPct.className = `p-6 rounded-2xl shadow-sm bg-gradient-to-br text-white transition-all duration-500 ${pct >= 100 ? 'from-indigo-600 to-blue-700' : 'from-red-600 to-rose-700'}`;
        }
    }
};