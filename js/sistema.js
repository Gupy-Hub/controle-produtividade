const Sistema = {
    Datas: {
        configurarInputGlobal: function(elementId, callback) {
            const input = document.getElementById(elementId);
            if (!input) return;
            input.value = DataGlobal.obter();
            input.addEventListener('input', function() { mascaraDataGlobal(this); });
            input.addEventListener('change', function() {
                if (this.value.length === 10) {
                    DataGlobal.definir(this.value);
                    if (typeof callback === 'function') callback();
                }
            });
            input.addEventListener('keypress', function(e) {
                if(e.key === 'Enter' && this.value.length === 10) { this.blur(); }
            });
        },

        obterDataObjeto: function() {
            const str = DataGlobal.obter();
            if (!str || str.length !== 10) return new Date();
            const parts = str.split('/');
            return new Date(parts[2], parts[1] - 1, parts[0]);
        },

        getSemanaDoMes: function(dataIsoStr) {
            const date = new Date(dataIsoStr + 'T12:00:00');
            const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
            return Math.ceil((date.getDate() + firstDay) / 7);
        }
    },

    Dados: {
        usuariosCache: {},
        metasCache: [], // Novo cache para as metas

        // Carrega usuários e Metas ao mesmo tempo
        inicializar: async function() {
            if (!window._supabase) { console.error("Supabase Off"); return; }
            
            // 1. Busca Usuários
            const { data: users } = await _supabase.from('usuarios').select('id, nome, funcao');
            this.usuariosCache = {};
            if(users) users.forEach(u => this.usuariosCache[u.id] = u);

            // 2. Busca Histórico de Metas (Ordenado por data decrescente para facilitar a busca)
            const { data: metas } = await _supabase.from('metas').select('*').order('data_inicio', { ascending: false });
            this.metasCache = metas || [];
        },

        // Função inteligente para descobrir a meta na data específica
        obterMetaVigente: function(usuarioId, dataReferencia) {
            // Filtra metas deste usuário
            const metasUsuario = this.metasCache.filter(m => m.usuario_id == usuarioId);
            
            // Encontra a primeira meta cuja data de início seja menor ou igual à data de referência
            // Como a lista já está ordenada decrescente (do mais novo para o mais velho),
            // o primeiro match é a meta vigente na época.
            const metaEncontrada = metasUsuario.find(m => m.data_inicio <= dataReferencia);

            // Se achar, retorna o valor. Se não, retorna 650 (padrão)
            return metaEncontrada ? metaEncontrada.valor_meta : 650;
        },

        normalizar: function(listaProducao) {
            const agrupado = {};

            listaProducao.forEach(item => {
                const uid = item.usuario_id;
                const user = this.usuariosCache[uid];
                
                if (!user || user.funcao !== 'Assistente') return;

                if (!agrupado[uid]) {
                    agrupado[uid] = {
                        nome: user.nome,
                        diasSet: new Set(),
                        total: 0,
                        fifo: 0,
                        gt: 0, gp: 0,
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

                // --- CORREÇÃO AQUI ---
                // Em vez de usar o valor fixo no banco, calculamos com base no histórico
                const metaDoDia = this.obterMetaVigente(uid, item.data_referencia);
                agrupado[uid].metaAccum += metaDoDia;
            });

            return Object.values(agrupado).map(obj => {
                return {
                    nome: obj.nome,
                    dias: obj.diasSet.size,
                    total: obj.total,
                    fifo: obj.fifo,
                    gt: obj.gt,
                    gp: obj.gp,
                    meta: obj.metaAccum,
                    atingiu: obj.total >= obj.metaAccum
                };
            }).sort((a, b) => b.total - a.total);
        }
    }
};