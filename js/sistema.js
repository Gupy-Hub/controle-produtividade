const Sistema = {
    Datas: {
        // Vincula o input de data global (do topo da página) ao DataGlobal do config.js
        configurarInputGlobal: function(elementId, callback) {
            const input = document.getElementById(elementId);
            if (!input) return;

            // Define o valor inicial recuperado do localStorage
            input.value = DataGlobal.obter();

            // Aplica a máscara enquanto digita
            input.addEventListener('input', function() {
                mascaraDataGlobal(this);
            });

            // Ao confirmar (mudança completa), atualiza o global e recarrega a tela
            input.addEventListener('change', function() {
                if (this.value.length === 10) {
                    DataGlobal.definir(this.value);
                    if (typeof callback === 'function') callback();
                }
            });
            
            // Garante que o Enter funcione para disparar o change
            input.addEventListener('keypress', function(e) {
                if(e.key === 'Enter' && this.value.length === 10) {
                    this.blur(); 
                }
            });
        },

        // Retorna um objeto Date com base na data selecionada no topo
        obterDataObjeto: function() {
            const str = DataGlobal.obter();
            if (!str || str.length !== 10) return new Date();
            const parts = str.split('/');
            // Cria data UTC/Local segura (Ano, Mês-1, Dia)
            return new Date(parts[2], parts[1] - 1, parts[0]);
        },

        // Calcula a semana do mês para os filtros de semana
        getSemanaDoMes: function(dataIsoStr) {
            // dataIsoStr vem do banco como YYYY-MM-DD
            const date = new Date(dataIsoStr + 'T12:00:00');
            const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
            return Math.ceil((date.getDate() + firstDay) / 7);
        }
    },

    Dados: {
        usuariosCache: {},

        // Carrega usuários para mapear ID -> Nome
        carregarUsuarios: async function() {
            if (!window._supabase) {
                console.error("Supabase não inicializado.");
                return;
            }
            // Busca apenas campos necessários
            const { data, error } = await _supabase
                .from('usuarios')
                .select('id, nome, funcao');
            
            if (error) {
                console.error("Erro ao carregar usuários:", error);
                return;
            }

            // Cria um mapa para acesso rápido: usuariosCache[id] = dados
            this.usuariosCache = {};
            data.forEach(u => {
                this.usuariosCache[u.id] = u;
            });
        },

        // Transforma os dados brutos do Supabase na estrutura que a tabela espera
        normalizar: function(listaProducao) {
            const agrupado = {};

            listaProducao.forEach(item => {
                const uid = item.usuario_id;
                const user = this.usuariosCache[uid];
                
                // Filtra apenas Assistentes (para evitar gestores na tabela de produção)
                if (!user || user.funcao !== 'Assistente') return;

                if (!agrupado[uid]) {
                    agrupado[uid] = {
                        nome: user.nome,
                        diasSet: new Set(),
                        total: 0,
                        fifo: 0,
                        gt: 0, // Gradual Total
                        gp: 0, // Gradual Parcial
                        metaAccum: 0,
                        atingiu: false
                    };
                }

                // Soma os valores
                const qtd = Number(item.quantidade) || 0;
                agrupado[uid].total += qtd;
                agrupado[uid].fifo += Number(item.fifo) || 0;
                agrupado[uid].gt += Number(item.gradual_total) || 0;
                agrupado[uid].gp += Number(item.gradual_parcial) || 0;
                agrupado[uid].metaAccum += Number(item.meta_diaria) || 650; // Meta padrão se nula
                agrupado[uid].diasSet.add(item.data_referencia);
            });

            // Converte objeto agrupado em array para a tabela
            return Object.values(agrupado).map(obj => {
                return {
                    nome: obj.nome,
                    dias: obj.diasSet.size,
                    total: obj.total,
                    fifo: obj.fifo,
                    gt: obj.gt,
                    gp: obj.gp,
                    meta: obj.metaAccum,
                    // Verifica se bateu a meta somada do período
                    atingiu: obj.total >= obj.metaAccum
                };
            }).sort((a, b) => b.total - a.total); // Ordena do maior para o menor
        }
    }
};