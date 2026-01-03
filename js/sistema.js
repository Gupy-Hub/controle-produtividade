const Sistema = {
    Datas: {
        criarInputInteligente: function(elementId, storageKey, callback) {
            const input = document.getElementById(elementId);
            if (!input) return;
            const salva = localStorage.getItem(storageKey);
            input.value = salva && salva.length === 10 ? salva : new Date().toISOString().split('T')[0];
            
            input.addEventListener('change', function() {
                if (this.value.length === 10) {
                    localStorage.setItem(storageKey, this.value);
                    if (typeof callback === 'function') callback();
                }
            });
        }
    },

    Dados: {
        usuariosCache: {},
        metasCache: [],
        fatoresCache: {}, 
        basesHcCache: {}, 
        inicializado: false,

        inicializar: async function() {
            const savedFator = localStorage.getItem('produtividade_fatores_v2');
            this.fatoresCache = savedFator ? JSON.parse(savedFator) : {};

            const savedBase = localStorage.getItem('produtividade_bases_hc_v2');
            this.basesHcCache = savedBase ? JSON.parse(savedBase) : {};

            if (this.inicializado) return; 

            if (!window._supabase) { console.error("Supabase Off"); return; }
            
            try {
                const { data: users, error: errUser } = await _supabase
                    .from('usuarios')
                    .select('id, nome, funcao, contrato, ativo')
                    .order('nome');
                
                if (errUser) throw errUser;
                this.usuariosCache = {};
                if(users) users.forEach(u => this.usuariosCache[u.id] = u);
                
                const { data: metas, error: errMeta } = await _supabase
                    .from('metas')
                    .select('*')
                    .order('data_inicio', { ascending: false });
                    
                if (errMeta) throw errMeta;
                this.metasCache = metas || [];
                
                this.inicializado = true;
                console.log("Sistema: Dados carregados.");
            } catch (e) {
                console.error("Erro Sistema:", e);
            }
        },

        // Conta quantos assistentes estão marcados como 'ativo' no cadastro
        contarAssistentesAtivos: function() {
            if (!this.usuariosCache) return 0;
            return Object.values(this.usuariosCache).filter(u => u.funcao === 'Assistente' && u.ativo).length;
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

        definirBaseHC: function(dataRef, quantidade) {
            if(!dataRef) return;
            const key = dataRef.substring(0, 7); 
            
            // Se o valor for vazio ou igual ao count do sistema, remove o override
            const countSistema = this.contarAssistentesAtivos();
            
            if (!quantidade || parseInt(quantidade) === countSistema) {
                delete this.basesHcCache[key]; // Usa o padrão
            } else {
                this.basesHcCache[key] = parseInt(quantidade);
            }
            
            localStorage.setItem('produtividade_bases_hc_v2', JSON.stringify(this.basesHcCache));
        },

        obterBaseHC: function(dataRef) {
            if(!dataRef) return this.contarAssistentesAtivos() || 17;
            const key = dataRef.substring(0, 7);
            
            // Retorna o manual se existir, senão retorna o count atual do sistema
            return this.basesHcCache[key] !== undefined ? this.basesHcCache[key] : (this.contarAssistentesAtivos() || 17);
        },

        calcularMediaBasePeriodo: function(dataInicio, dataFim) {
            let inicio = new Date(dataInicio);
            const fim = new Date(dataFim);
            let somaBases = 0;
            let mesesContados = 0;
            
            inicio.setDate(1);

            while (inicio <= fim) {
                const ano = inicio.getFullYear();
                const mes = String(inicio.getMonth() + 1).padStart(2, '0');
                const dataRef = `${ano}-${mes}-01`;
                
                const base = this.obterBaseHC(dataRef);
                
                somaBases += base;
                mesesContados++;
                
                inicio.setMonth(inicio.getMonth() + 1);
            }

            return mesesContados > 0 ? Math.round(somaBases / mesesContados) : (this.contarAssistentesAtivos() || 17);
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
                if (!user || (user.funcao && user.funcao !== 'Assistente')) return;

                const nomeChave = user.nome.trim();

                if (!agrupado[nomeChave]) {
                    agrupado[nomeChave] = {
                        nome: user.nome,
                        ids: new Set(),
                        diasMap: {}, 
                        total: 0, fifo: 0, gt: 0, gp: 0,
                        metaAcc: 0,
                        inativo: !user.ativo
                    };
                }

                agrupado[nomeChave].ids.add(uid);
                agrupado[nomeChave].total += (Number(item.quantidade) || 0);
                agrupado[nomeChave].fifo += (Number(item.fifo) || 0);
                agrupado[nomeChave].gt += (Number(item.gradual_total) || 0);
                agrupado[nomeChave].gp += (Number(item.gradual_parcial) || 0);

                const dia = item.data_referencia;
                if (!agrupado[nomeChave].diasMap[dia]) {
                    agrupado[nomeChave].diasMap[dia] = { qtd: 0 };
                }
                agrupado[nomeChave].diasMap[dia].qtd += (Number(item.quantidade) || 0);
            });

            return Object.values(agrupado).map(obj => {
                let diasContabilizados = 0;
                let metaTotalAdjustada = 0;

                Object.keys(obj.diasMap).forEach(dia => {
                    const fator = this.obterFator(obj.nome, dia);
                    const uid = obj.ids.values().next().value;
                    const metaBase = this.obterMetaVigente(uid, dia);

                    diasContabilizados += fator;
                    metaTotalAdjustada += (metaBase * fator);
                    
                    obj.diasMap[dia].fator = fator;
                    obj.diasMap[dia].meta = metaBase * fator;
                });

                return {
                    ...obj,
                    dias: diasContabilizados,
                    meta: Math.round(metaTotalAdjustada),
                    atingiu: obj.total >= metaTotalAdjustada
                };
            }).sort((a, b) => b.total - a.total);
        }
    }
};