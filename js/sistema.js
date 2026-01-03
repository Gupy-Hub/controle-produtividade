const Sistema = {
    Datas: {
        criarInputInteligente: function(elementId, storageKey, callback) {
            const input = document.getElementById(elementId);
            if (!input) return;
            const salva = localStorage.getItem(storageKey);
            // Se houver valor salvo, usa; senão data de hoje
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
        fatoresCache: {}, // Cache para os fatores (1, 0.5, 0)
        inicializado: false,

        inicializar: async function() {
            // Recarrega fatores do localStorage sempre que inicializar/reinicializar
            const saved = localStorage.getItem('produtividade_fatores_v2');
            this.fatoresCache = saved ? JSON.parse(saved) : {};

            if (this.inicializado) return; 

            if (!window._supabase) { console.error("Supabase Off"); return; }
            
            try {
                // Carrega usuários
                const { data: users, error: errUser } = await _supabase
                    .from('usuarios')
                    .select('id, nome, funcao, contrato, ativo')
                    .order('nome');
                
                if (errUser) throw errUser;
                this.usuariosCache = {};
                if(users) users.forEach(u => this.usuariosCache[u.id] = u);
                
                // Carrega metas
                const { data: metas, error: errMeta } = await _supabase
                    .from('metas')
                    .select('*')
                    .order('data_inicio', { ascending: false });
                    
                if (errMeta) throw errMeta;
                this.metasCache = metas || [];
                
                this.inicializado = true;
                console.log("Sistema: Dados iniciais carregados.");
            } catch (e) {
                console.error("Erro Sistema:", e);
            }
        },

        definirFator: function(nome, dataRef, fator) {
            if (!this.fatoresCache[dataRef]) this.fatoresCache[dataRef] = {};
            this.fatoresCache[dataRef][nome] = parseFloat(fator);
            localStorage.setItem('produtividade_fatores_v2', JSON.stringify(this.fatoresCache));
        },

        obterFator: function(nome, dataRef) {
            // Retorna 1.0 (Dia cheio) se não houver definição
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

        // Normaliza dados para a aba GERAL
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
                        inativo: !user.ativo // Marca se o usuário está inativo no cadastro
                    };
                }

                agrupado[nomeChave].ids.add(uid);
                agrupado[nomeChave].total += (Number(item.quantidade) || 0);
                agrupado[nomeChave].fifo += (Number(item.fifo) || 0);
                agrupado[nomeChave].gt += (Number(item.gradual_total) || 0);
                agrupado[nomeChave].gp += (Number(item.gradual_parcial) || 0);

                const dia = item.data_referencia;
                // Garante que o dia exista no mapa para buscar o fator depois
                if (!agrupado[nomeChave].diasMap[dia]) {
                    agrupado[nomeChave].diasMap[dia] = { qtd: 0 };
                }
                agrupado[nomeChave].diasMap[dia].qtd += (Number(item.quantidade) || 0);
            });

            // Processamento final: Aplica Fatores e Metas
            return Object.values(agrupado).map(obj => {
                let diasContabilizados = 0;
                let metaTotalAdjustada = 0;

                // Itera sobre os dias que tiveram produção OU que foram registrados
                Object.keys(obj.diasMap).forEach(dia => {
                    const fator = this.obterFator(obj.nome, dia);
                    
                    // Busca ID do usuário para meta (pega o primeiro ID associado ao nome)
                    const uid = obj.ids.values().next().value;
                    const metaBase = this.obterMetaVigente(uid, dia);

                    diasContabilizados += fator; // Soma 1, 0.5 ou 0
                    metaTotalAdjustada += (metaBase * fator); // Meta proporcional
                    
                    // Salva fator no objeto do dia para exibição no select
                    obj.diasMap[dia].fator = fator;
                    obj.diasMap[dia].meta = metaBase * fator;
                });

                return {
                    ...obj,
                    dias: diasContabilizados, // Agora pode ser decimal (ex: 4.5)
                    meta: Math.round(metaTotalAdjustada),
                    atingiu: obj.total >= metaTotalAdjustada
                };
            }).sort((a, b) => b.total - a.total);
        }
    }
};