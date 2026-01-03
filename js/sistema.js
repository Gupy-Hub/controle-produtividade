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

            input.addEventListener('input', function() {
                let v = this.value.replace(/\D/g, '').slice(0, 8);
                if (v.length >= 5) v = v.replace(/(\d{2})(\d{2})(\d{1,4})/, '$1/$2/$3');
                else if (v.length >= 3) v = v.replace(/(\d{2})(\d{1,2})/, '$1/$2');
                this.value = v;
            });

            input.addEventListener('change', function() {
                if (this.value.length === 10) {
                    localStorage.setItem(storageKey, this.value);
                    if (typeof callback === 'function') callback();
                }
            });
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
        fatoresCache: {},
        inicializado: false,

        inicializar: async function() {
            if (this.inicializado) return; // Evita recarregar à toa

            const saved = localStorage.getItem('produtividade_fatores_v2');
            this.fatoresCache = saved ? JSON.parse(saved) : {};

            if (!window._supabase) { console.error("Supabase Off"); return; }
            
            try {
                // CORREÇÃO: Busca colunas essenciais para todas as abas (incluindo contrato)
                const { data: users, error: errUser } = await _supabase
                    .from('usuarios')
                    .select('id, nome, funcao, contrato, ativo')
                    .order('nome');
                
                if (errUser) throw errUser;

                this.usuariosCache = {};
                if(users) {
                    users.forEach(u => this.usuariosCache[u.id] = u);
                }
                
                const { data: metas, error: errMeta } = await _supabase
                    .from('metas')
                    .select('*')
                    .order('data_inicio', { ascending: false });
                    
                if (errMeta) throw errMeta;
                this.metasCache = metas || [];
                
                this.inicializado = true;
                console.log("Sistema inicializado com sucesso.");
            } catch (e) {
                console.error("Erro ao inicializar Sistema:", e);
            }
        },

        definirFator: function(nome, dataRef, fator) {
            if (!this.fatoresCache[dataRef]) this.fatoresCache[dataRef] = {};
            this.fatoresCache[dataRef][nome] = parseFloat(fator);
            localStorage.setItem('produtividade_fatores_v2', JSON.stringify(this.fatoresCache));
        },

        obterFator: function(nome, dataRef) {
            if (this.fatoresCache[dataRef] && this.fatoresCache[dataRef][nome] !== undefined) {
                return this.fatoresCache[dataRef][nome];
            }
            return 1.0; 
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
                
                if (!user) user = { id: uid, nome: `Desconhecido (ID ${uid})`, funcao: 'Assistente' };
                if (user.funcao && user.funcao !== 'Assistente') return;

                const nomeChave = user.nome.trim();

                if (!agrupado[nomeChave]) {
                    agrupado[nomeChave] = {
                        nome: user.nome,
                        ids: new Set(),
                        diasMap: {}, 
                        total: 0, fifo: 0, gt: 0, gp: 0,
                        metaAcc: 0 // Acumulador de meta
                    };
                }

                agrupado[nomeChave].ids.add(uid);

                const qtd = Number(item.quantidade) || 0;
                agrupado[nomeChave].total += qtd;
                agrupado[nomeChave].fifo += Number(item.fifo) || 0;
                agrupado[nomeChave].gt += Number(item.gradual_total) || 0;
                agrupado[nomeChave].gp += Number(item.gradual_parcial) || 0;

                const dia = item.data_referencia;
                // Busca meta correta do dia
                const metaDoDia = this.obterMetaVigente(uid, dia);
                
                if (!agrupado[nomeChave].diasMap[dia]) {
                    agrupado[nomeChave].diasMap[dia] = {
                        metaBase: metaDoDia,
                        fator: this.obterFator(user.nome, dia)
                    };
                }
            });

            return Object.values(agrupado).map(obj => {
                let diasContabilizados = 0;
                let metaTotalAdjustada = 0;

                Object.values(obj.diasMap).forEach(d => {
                    diasContabilizados += d.fator; 
                    metaTotalAdjustada += (d.metaBase * d.fator);
                });

                return {
                    nome: obj.nome,
                    ids: Array.from(obj.ids),
                    diasMap: obj.diasMap,
                    dias: diasContabilizados,
                    total: obj.total,
                    fifo: obj.fifo, gt: obj.gt, gp: obj.gp,
                    meta: Math.round(metaTotalAdjustada),
                    atingiu: obj.total >= metaTotalAdjustada,
                    inativo: diasContabilizados === 0 && obj.total === 0 
                };
            }).sort((a, b) => b.total - a.total);
        }
    }
};