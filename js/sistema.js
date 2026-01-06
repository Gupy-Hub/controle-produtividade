const Sistema = {
    Datas: {
        // Cria um input de data que salva o último valor selecionado no navegador
        criarInputInteligente: function(elementId, storageKey, callback) {
            const input = document.getElementById(elementId);
            if (!input) return;

            const valorSalvo = localStorage.getItem(storageKey);
            // Garante que o valor seja uma data válida no formato YYYY-MM-DD
            if (valorSalvo && valorSalvo.length === 10) {
                input.value = valorSalvo;
            } else {
                input.value = new Date().toISOString().split('T')[0];
            }
            
            input.addEventListener('change', function() {
                if (this.value.length === 10) {
                    localStorage.setItem(storageKey, this.value);
                    if (typeof callback === 'function') {
                        callback();
                    }
                }
            });
        }
    },

    Dados: {
        usuariosCache: {},
        metasCache: [],
        fatoresCache: {}, 
        motivosCache: {},
        basesHcCache: {}, 
        inicializado: false,

        inicializar: async function() {
            // 1. Carrega Caches Locais (LocalStorage)
            try {
                const savedFator = localStorage.getItem('produtividade_fatores_v2');
                this.fatoresCache = savedFator ? JSON.parse(savedFator) : {};

                const savedMotivos = localStorage.getItem('produtividade_motivos_v1');
                this.motivosCache = savedMotivos ? JSON.parse(savedMotivos) : {};

                const savedBase = localStorage.getItem('produtividade_bases_hc_v2');
                this.basesHcCache = savedBase ? JSON.parse(savedBase) : {};
            } catch(erro) {
                console.warn("Erro ao ler localStorage, resetando caches locais.", erro);
                this.fatoresCache = {};
                this.motivosCache = {};
                this.basesHcCache = {};
            }

            if (this.inicializado) return; 

            // 2. Verificação de Segurança do Supabase
            if (!window._supabase) { 
                console.warn("Sistema: Cliente Supabase não encontrado. Verifique se o config.js foi carregado."); 
                return; 
            }
            
            // 3. Carrega Dados do Banco de Dados
            try {
                // Carrega Usuários
                const { data: usuarios, error: errUser } = await window._supabase
                    .from('usuarios')
                    .select('id, nome, funcao, contrato, ativo')
                    .order('nome');
                
                if (errUser) throw errUser;
                
                this.usuariosCache = {};
                if (usuarios) {
                    usuarios.forEach(usuario => {
                        this.usuariosCache[usuario.id] = usuario;
                    });
                }
                
                // Carrega Histórico de Metas
                const { data: metas, error: errMeta } = await window._supabase
                    .from('metas')
                    .select('*')
                    .order('data_inicio', { ascending: false });
                    
                if (errMeta) throw errMeta;
                this.metasCache = metas || [];
                
                this.inicializado = true;
                console.log("Sistema: Dados carregados e inicializados com sucesso.");

            } catch (erro) {
                console.error("Erro crítico na inicialização do Sistema:", erro);
            }
        },

        // --- GESTÃO DE FATORES (Abonos e Meio Período) ---
        
        definirFator: function(nomeUsuario, dataReferencia, fator) {
            if (!this.fatoresCache[dataReferencia]) {
                this.fatoresCache[dataReferencia] = {};
            }
            this.fatoresCache[dataReferencia][nomeUsuario] = parseFloat(fator);
            localStorage.setItem('produtividade_fatores_v2', JSON.stringify(this.fatoresCache));
        },

        obterFator: function(nomeUsuario, dataReferencia) {
            if (this.fatoresCache[dataReferencia] && this.fatoresCache[dataReferencia][nomeUsuario] !== undefined) {
                return this.fatoresCache[dataReferencia][nomeUsuario];
            }
            return 1.0; // Padrão é 100% (1.0)
        },

        // --- GESTÃO DE MOTIVOS (Justificativas) ---

        definirMotivo: function(nomeUsuario, dataReferencia, motivo) {
            if (!this.motivosCache[dataReferencia]) {
                this.motivosCache[dataReferencia] = {};
            }
            
            if (motivo && motivo.trim() !== "") {
                this.motivosCache[dataReferencia][nomeUsuario] = motivo;
            } else {
                delete this.motivosCache[dataReferencia][nomeUsuario];
            }
            
            localStorage.setItem('produtividade_motivos_v1', JSON.stringify(this.motivosCache));
        },

        obterMotivo: function(nomeUsuario, dataReferencia) {
            if (this.motivosCache[dataReferencia] && this.motivosCache[dataReferencia][nomeUsuario]) {
                return this.motivosCache[dataReferencia][nomeUsuario];
            }
            return "";
        },

        // --- GESTÃO DE BASE DE ASSISTENTES (Consolidado) ---

        definirBaseHC: function(dataReferencia, quantidade) {
            if (!dataReferencia) return;
            // A chave é o mês (YYYY-MM)
            const chaveMes = dataReferencia.substring(0, 7); 
            
            if (!quantidade || parseInt(quantidade) === 17) {
                delete this.basesHcCache[chaveMes]; // Remove se for o padrão (17) ou vazio
            } else {
                this.basesHcCache[chaveMes] = parseInt(quantidade);
            }
            localStorage.setItem('produtividade_bases_hc_v2', JSON.stringify(this.basesHcCache));
        },

        obterBaseHC: function(dataReferencia) {
            if (!dataReferencia) return 17;
            const chaveMes = dataReferencia.substring(0, 7);
            return this.basesHcCache[chaveMes] !== undefined ? this.basesHcCache[chaveMes] : 17;
        },

        calcularMediaBasePeriodo: function(dataInicio, dataFim) {
            if (!dataInicio || !dataFim) return 17;
            
            let inicio = new Date(dataInicio + 'T12:00:00');
            const fim = new Date(dataFim + 'T12:00:00');
            
            let somaBases = 0;
            let mesesContados = 0;
            let protecaoLoop = 0;

            // Ajusta para o dia 1 para iterar mensalmente
            inicio.setDate(1);

            while (inicio <= fim && protecaoLoop < 100) {
                const ano = inicio.getFullYear();
                const mes = String(inicio.getMonth() + 1).padStart(2, '0');
                const dataRef = `${ano}-${mes}-01`;
                
                somaBases += this.obterBaseHC(dataRef);
                mesesContados++;
                
                inicio.setMonth(inicio.getMonth() + 1);
                protecaoLoop++;
            }
            
            return mesesContados > 0 ? Math.round(somaBases / mesesContados) : 17;
        },

        // --- GESTÃO DE METAS ---

        obterMetaVigente: function(usuarioId, dataReferencia) {
            // Filtra as metas deste usuário
            const metasUsuario = this.metasCache.filter(m => m.usuario_id == usuarioId);
            
            // Encontra a meta cuja data de início é menor ou igual à data de referência (a mais recente possível)
            // Como metasCache já vem ordenado por data DESC do banco, o find pega a correta
            const metaEncontrada = metasUsuario.find(m => m.data_inicio <= dataReferencia);
            
            return metaEncontrada ? metaEncontrada.valor_meta : 650; // Padrão 650 se não achar
        },

        // --- NORMALIZAÇÃO DE DADOS (Para Painel Geral) ---
        
        normalizar: function(listaProducao) {
            const dadosAgrupados = {};

            listaProducao.forEach(item => {
                const usuarioId = item.usuario_id;
                const usuario = this.usuariosCache[usuarioId];

                // Filtra apenas Assistentes
                if (!usuario || (usuario.funcao && usuario.funcao !== 'Assistente')) return;

                const nomeChave = usuario.nome.trim();

                if (!dadosAgrupados[nomeChave]) {
                    dadosAgrupados[nomeChave] = {
                        nome: usuario.nome,
                        ids: new Set(),
                        diasMap: {}, // Mapa para acesso rápido por data
                        total: 0,
                        fifo: 0,
                        gt: 0, // Gradual Total
                        gp: 0, // Gradual Parcial
                        inativo: !usuario.ativo
                    };
                }

                dadosAgrupados[nomeChave].ids.add(usuarioId);
                dadosAgrupados[nomeChave].total += (Number(item.quantidade) || 0);
                dadosAgrupados[nomeChave].fifo += (Number(item.fifo) || 0);
                dadosAgrupados[nomeChave].gt += (Number(item.gradual_total) || 0);
                dadosAgrupados[nomeChave].gp += (Number(item.gradual_parcial) || 0);

                const dataRef = item.data_referencia;
                if (!dadosAgrupados[nomeChave].diasMap[dataRef]) {
                    dadosAgrupados[nomeChave].diasMap[dataRef] = { quantidade: 0 };
                }
                dadosAgrupados[nomeChave].diasMap[dataRef].quantidade += (Number(item.quantidade) || 0);
            });

            // Transforma o objeto agrupado em array e calcula metas ajustadas pelos fatores
            return Object.values(dadosAgrupados).map(obj => {
                let diasContabilizados = 0;
                let metaTotalAjustada = 0;

                Object.keys(obj.diasMap).forEach(data => {
                    const fator = this.obterFator(obj.nome, data);
                    
                    // Pega o ID do usuário (o primeiro do Set) para buscar a meta
                    const uid = obj.ids.values().next().value;
                    const metaBaseDiaria = this.obterMetaVigente(uid, data);
                    
                    diasContabilizados += fator;
                    metaTotalAjustada += (metaBaseDiaria * fator);

                    // Armazena detalhes no dia para uso na tabela expandida
                    obj.diasMap[data].fator = fator;
                    obj.diasMap[data].meta = metaBaseDiaria * fator;
                });

                return {
                    ...obj,
                    dias: diasContabilizados,
                    meta: Math.round(metaTotalAjustada),
                    atingiu: obj.total >= metaTotalAjustada
                };
            }).sort((a, b) => b.total - a.total); // Ordena por produção total decrescente
        }
    }
};