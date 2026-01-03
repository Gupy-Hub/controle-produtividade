const Sistema = {
    Datas: {
        // Lê a data de um input e devolve um objeto Date
        lerInput: function(elementId) {
            const el = document.getElementById(elementId);
            if (!el || el.value.length !== 10) return new Date();
            const parts = el.value.split('/');
            // Mês no JS começa em 0 (Janeiro = 0)
            return new Date(parts[2], parts[1] - 1, parts[0]);
        },

        // Formata objeto Date para string DD/MM/AAAA
        formatar: function(date) {
            const d = String(date.getDate()).padStart(2, '0');
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const a = date.getFullYear();
            return `${d}/${m}/${a}`;
        },

        // CRIA O COMPORTAMENTO DE DATA INTELIGENTE
        criarInputInteligente: function(elementId, storageKey, callback) {
            const input = document.getElementById(elementId);
            if (!input) return;

            // 1. Carregar valor inicial (do Storage ou Hoje)
            const salva = localStorage.getItem(storageKey);
            input.value = salva && salva.length === 10 ? salva : this.formatar(new Date());

            // 2. Máscara de digitação
            input.addEventListener('input', function() {
                let v = this.value.replace(/\D/g, '').slice(0, 8);
                if (v.length >= 5) v = v.replace(/(\d{2})(\d{2})(\d{1,4})/, '$1/$2/$3');
                else if (v.length >= 3) v = v.replace(/(\d{2})(\d{1,2})/, '$1/$2');
                this.value = v;
            });

            // 3. Selecionar tudo ao clicar (foco)
            input.addEventListener('focus', function() {
                this.select();
            });

            // 4. Setas do Teclado (Alterar Dias)
            input.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    let atual = this.lerInput(elementId);
                    // Seta Cima (+1 dia), Seta Baixo (-1 dia)
                    atual.setDate(atual.getDate() + (e.key === 'ArrowUp' ? 1 : -1));
                    input.value = this.formatar(atual);
                    
                    // Dispara evento de mudança para salvar/recarregar
                    input.dispatchEvent(new Event('change'));
                }
            });

            // 5. Salvar e Executar Callback ao mudar
            input.addEventListener('change', function() {
                if (this.value.length === 10) {
                    localStorage.setItem(storageKey, this.value);
                    if (typeof callback === 'function') callback();
                }
            });
            
            // Enter para confirmar (tirar o foco)
            input.addEventListener('keypress', function(e) {
                if(e.key === 'Enter') this.blur();
            });
        },

        // Utilitário para pegar a semana do mês
        getSemanaDoMes: function(dataIsoStr) {
            const date = new Date(dataIsoStr + 'T12:00:00');
            const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
            return Math.ceil((date.getDate() + firstDay) / 7);
        }
    },

    Dados: {
        usuariosCache: {},
        metasCache: [],

        // Carrega Usuários e Metas do Supabase
        inicializar: async function() {
            if (!window._supabase) { console.error("Supabase Off"); return; }
            
            // Busca Usuários
            const { data: users } = await _supabase.from('usuarios').select('id, nome, funcao');
            this.usuariosCache = {};
            if(users) users.forEach(u => this.usuariosCache[u.id] = u);
            
            // Busca Metas (Ordenadas por data para facilitar a busca da vigente)
            const { data: metas } = await _supabase.from('metas').select('*').order('data_inicio', { ascending: false });
            this.metasCache = metas || [];
        },

        // Lógica de Histórico de Metas
        obterMetaVigente: function(usuarioId, dataReferencia) {
            const metasUsuario = this.metasCache.filter(m => m.usuario_id == usuarioId);
            // Pega a primeira meta cuja data de inicio é anterior ou igual à data do registro
            const metaEncontrada = metasUsuario.find(m => m.data_inicio <= dataReferencia);
            return metaEncontrada ? metaEncontrada.valor_meta : 650;
        },

        // Prepara os dados para a tabela
        normalizar: function(listaProducao) {
            const agrupado = {};
            listaProducao.forEach(item => {
                const uid = item.usuario_id;
                const user = this.usuariosCache[uid];
                
                // Filtra apenas Assistentes
                if (!user || user.funcao !== 'Assistente') return;

                if (!agrupado[uid]) {
                    agrupado[uid] = {
                        nome: user.nome,
                        diasSet: new Set(),
                        total: 0,
                        fifo: 0, gt: 0, gp: 0,
                        metaAccum: 0,
                        atingiu: false
                    };
                }

                const qtd = Number(item.quantidade) || 0;
                agrupado[uid].total += qtd;
                agrupado[uid].fifo += Number(item.fifo) || 0;
                agrupado[uid].gt += Number(item.gradual_total) || 0;
                agrupado[uid].gp += Number(item.gradual_parcial) || 0;
                agrupado[uid].diasSet.add(item.data_referencia);

                // Aplica a meta correta daquela data específica
                const metaDoDia = this.obterMetaVigente(uid, item.data_referencia);
                agrupado[uid].metaAccum += metaDoDia;
            });

            return Object.values(agrupado).map(obj => {
                return {
                    nome: obj.nome,
                    dias: obj.diasSet.size,
                    total: obj.total,
                    fifo: obj.fifo, gt: obj.gt, gp: obj.gp,
                    meta: obj.metaAccum,
                    atingiu: obj.total >= obj.metaAccum
                };
            }).sort((a, b) => b.total - a.total);
        }
    }
};