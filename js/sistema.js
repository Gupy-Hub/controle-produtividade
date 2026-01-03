const Sistema = {
    Datas: {
        lerInput: function(elementIdOrNode) {
            const el = typeof elementIdOrNode === 'string' ? document.getElementById(elementIdOrNode) : elementIdOrNode;
            if (!el || el.value.length !== 10) return new Date();
            const parts = el.value.split('/');
            return new Date(parts[2], parts[1] - 1, parts[0]);
        },

        formatar: function(date) {
            const d = String(date.getDate()).padStart(2, '0');
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const a = date.getFullYear();
            return `${d}/${m}/${a}`;
        },

        criarInputInteligente: function(elementId, storageKey, callback) {
            const input = document.getElementById(elementId);
            if (!input) return;

            const salva = localStorage.getItem(storageKey);
            input.value = salva && salva.length === 10 ? salva : this.formatar(new Date());

            input.addEventListener('click', function() {
                const cursor = this.selectionStart;
                if (cursor <= 2) this.setSelectionRange(0, 2);
                else if (cursor >= 3 && cursor <= 5) this.setSelectionRange(3, 5);
                else this.setSelectionRange(6, 10);
            });

            input.addEventListener('input', function() {
                let v = this.value.replace(/\D/g, '').slice(0, 8);
                if (v.length >= 5) v = v.replace(/(\d{2})(\d{2})(\d{1,4})/, '$1/$2/$3');
                else if (v.length >= 3) v = v.replace(/(\d{2})(\d{1,2})/, '$1/$2');
                this.value = v;
            });

            const alterarData = (e, delta) => {
                e.preventDefault();
                const cursor = input.selectionStart;
                let mode = 'day', start = 0, end = 2;
                if (cursor >= 3 && cursor <= 5) { mode = 'month'; start = 3; end = 5; }
                if (cursor >= 6) { mode = 'year'; start = 6; end = 10; }

                let atual = Sistema.Datas.lerInput(input);
                if (mode === 'day') atual.setDate(atual.getDate() + delta);
                if (mode === 'month') atual.setMonth(atual.getMonth() + delta);
                if (mode === 'year') atual.setFullYear(atual.getFullYear() + delta);

                input.value = Sistema.Datas.formatar(atual);
                input.setSelectionRange(start, end);
                input.dispatchEvent(new Event('change'));
            };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowUp') alterarData(e, 1);
                if (e.key === 'ArrowDown') alterarData(e, -1);
            });

            input.addEventListener('wheel', (e) => {
                if (document.activeElement === input) {
                    const delta = e.deltaY < 0 ? 1 : -1;
                    alterarData(e, delta);
                }
            });

            input.addEventListener('change', function() {
                if (this.value.length === 10) {
                    localStorage.setItem(storageKey, this.value);
                    if (typeof callback === 'function') callback();
                }
            });
            input.addEventListener('keypress', function(e) { if(e.key === 'Enter') this.blur(); });
        },

        getSemanaDoMes: function(dataIsoStr) {
            const date = new Date(dataIsoStr + 'T12:00:00');
            const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
            return Math.ceil((date.getDate() + firstDay) / 7);
        }
    },

    Dados: {
        usuariosCache: {},
        metasCache: [],
        fatoresCache: {}, // Armazena ajustes manuais (0, 0.5, 1.0)

        inicializar: async function() {
            // Carrega ajustes do LocalStorage
            const savedFatores = localStorage.getItem('produtividade_fatores');
            this.fatoresCache = savedFatores ? JSON.parse(savedFatores) : {};

            if (!window._supabase) { console.error("Supabase Off"); return; }
            
            // Carrega Usuários (Traz TODOS para evitar sumiço se a função estiver vazia)
            const { data: users } = await _supabase.from('usuarios').select('id, nome, funcao');
            this.usuariosCache = {};
            if(users) users.forEach(u => this.usuariosCache[u.id] = u);
            
            const { data: metas } = await _supabase.from('metas').select('*').order('data_inicio', { ascending: false });
            this.metasCache = metas || [];
        },

        // Salva ajuste manual (Ex: Maria, 2025-10-01, 0.5)
        definirFator: function(nome, dataRef, fator) {
            if (!this.fatoresCache[dataRef]) this.fatoresCache[dataRef] = {};
            this.fatoresCache[dataRef][nome] = parseFloat(fator);
            localStorage.setItem('produtividade_fatores', JSON.stringify(this.fatoresCache));
        },

        obterFator: function(nome, dataRef) {
            if (this.fatoresCache[dataRef] && this.fatoresCache[dataRef][nome] !== undefined) {
                return this.fatoresCache[dataRef][nome];
            }
            return 1.0; // Padrão é 100%
        },

        obterMetaVigente: function(usuarioId, dataReferencia) {
            const metasUsuario = this.metasCache.filter(m => m.usuario_id == usuarioId);
            const metaEncontrada = metasUsuario.find(m => m.data_inicio <= dataReferencia);
            return metaEncontrada ? metaEncontrada.valor_meta : 650;
        },

        normalizar: function(listaProducao) {
            const agrupado = {};

            listaProducao.forEach(item => {
                const uid = item.usuario_id;
                let user = this.usuariosCache[uid];
                
                // CORREÇÃO: Se não achar no cache, cria um provisório para não sumir da lista
                if (!user) {
                    user = { id: uid, nome: "Desconhecido (ID " + uid + ")", funcao: 'Assistente' };
                }
                
                // Filtra apenas Assistentes (ou quem não tem função definida para garantir)
                if (user.funcao && user.funcao !== 'Assistente') return;

                const nomeChave = user.nome.trim();

                if (!agrupado[nomeChave]) {
                    agrupado[nomeChave] = {
                        nome: user.nome,
                        ids: new Set(),
                        diasCalculados: 0, // Soma dos fatores (0, 0.5, 1)
                        total: 0,
                        fifo: 0, gt: 0, gp: 0,
                        metaAccum: 0,
                        atingiu: false
                    };
                }

                agrupado[nomeChave].ids.add(uid);

                // --- LÓGICA DO FATOR ---
                // Verifica se tem ajuste manual para essa pessoa nessa data
                const fator = this.obterFator(user.nome, item.data_referencia);
                
                // Se fator for 0, ignoramos os dias e a meta, mas mantemos a produção realizada
                const qtd = Number(item.quantidade) || 0;
                agrupado[nomeChave].total += qtd;
                agrupado[nomeChave].fifo += Number(item.fifo) || 0;
                agrupado[nomeChave].gt += Number(item.gradual_total) || 0;
                agrupado[nomeChave].gp += Number(item.gradual_parcial) || 0;

                // Soma Dias (considerando meio período)
                // Se fator > 0, conta. Se for 0.5, conta meio dia.
                agrupado[nomeChave].diasCalculados += fator;

                // Calcula Meta Proporcional
                const metaDoDia = this.obterMetaVigente(uid, item.data_referencia);
                agrupado[nomeChave].metaAccum += (metaDoDia * fator);
            });

            return Object.values(agrupado).map(obj => {
                return {
                    nome: obj.nome,
                    ids: Array.from(obj.ids),
                    dias: obj.diasCalculados, // Agora pode ser decimal (ex: 10.5)
                    total: obj.total,
                    fifo: obj.fifo, gt: obj.gt, gp: obj.gp,
                    meta: Math.round(obj.metaAccum),
                    atingiu: obj.total >= obj.metaAccum,
                    // Se dias = 0, consideramos inativo para fins de média, mas mostramos na lista
                    inativo: obj.diasCalculados === 0
                };
            }).sort((a, b) => b.total - a.total);
        }
    }
};