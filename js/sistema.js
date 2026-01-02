// js/sistema.js
// NÚCLEO DO SISTEMA - Todas as regras de negócio e utilitários globais

const Sistema = {
    // --- 1. GESTÃO DE DATAS E INPUTS ---
    Datas: {
        // Aplica a máscara e comportamento ao input de data manual
        configurarInput: (inputId, storageKey, callbackOnChange) => {
            const input = document.getElementById(inputId);
            if (!input) return;

            // 1. Carrega valor salvo ou define Hoje
            const salvo = localStorage.getItem(storageKey);
            if (salvo && salvo.length === 10) {
                input.value = salvo;
            } else {
                const hoje = new Date();
                input.value = Sistema.Datas.formatarDataPt(hoje);
            }

            // 2. Eventos
            input.onclick = function() { this.select(); }; // Seleciona tudo ao clicar
            
            input.oninput = function() {
                let v = this.value.replace(/\D/g, '').slice(0, 8);
                if (v.length >= 5) v = v.replace(/(\d{2})(\d{2})(\d{1,4})/, '$1/$2/$3');
                else if (v.length >= 3) v = v.replace(/(\d{2})(\d{1,2})/, '$1/$2');
                this.value = v;
            };

            input.onblur = function() {
                if (this.value.length === 10) {
                    localStorage.setItem(storageKey, this.value); // Salva
                    if (callbackOnChange) callbackOnChange(); // Atualiza tela
                }
            };

            input.onkeypress = function(e) {
                if (e.key === 'Enter') this.blur();
            };
        },

        // Converte string DD/MM/AAAA para objeto Date
        obterDataObjeto: (dataStr) => {
            if (!dataStr || dataStr.length !== 10) return new Date();
            const parts = dataStr.split('/');
            return new Date(parts[2], parts[1] - 1, parts[0]);
        },

        formatarDataPt: (date) => {
            const d = String(date.getDate()).padStart(2, '0');
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const a = date.getFullYear();
            return `${d}/${m}/${a}`;
        }
    },

    // --- 2. REGRAS DE NEGÓCIO E DADOS ---
    Dados: {
        // Mapa de Usuários em Cache (para não consultar o banco toda hora)
        mapaUsuarios: {},
        
        carregarUsuarios: async () => {
            if (Object.keys(Sistema.Dados.mapaUsuarios).length > 0) return; // Já carregou
            
            const { data } = await _supabase.from('usuarios').select('id, nome, funcao');
            if (data) {
                data.forEach(u => {
                    Sistema.Dados.mapaUsuarios[u.id] = { 
                        nome: u.nome, 
                        funcao: u.funcao 
                    };
                });
            }
        },

        // ALGORITMO DE NORMALIZAÇÃO (O SEGREDO)
        // Recebe dados brutos e retorna dados agrupados por Nome Único
        normalizarProducao: (dadosBrutos) => {
            const agrupado = {};

            dadosBrutos.forEach(item => {
                const usuario = Sistema.Dados.mapaUsuarios[item.usuario_id];
                
                // REGRA 1: Ignora se não for Assistente
                if (!usuario || usuario.funcao !== 'Assistente') return;

                const nome = usuario.nome;
                const dataRef = item.data_referencia;

                // Cria estrutura se não existir
                if (!agrupado[nome]) {
                    agrupado[nome] = {
                        nome: nome,
                        diasTrabalhados: new Set(), // Set garante dias únicos
                        totalProducao: 0,
                        metaAcumulada: 0,
                        metasPorDia: {} // Guarda a meta de cada dia para não somar duplicado
                    };
                }

                // Soma Produção (Sempre soma, pois pode ter produzido em IDs diferentes)
                agrupado[nome].totalProducao += (item.quantidade || 0);

                // Conta Dia Trabalhado (Se produziu > 0)
                if (item.quantidade > 0) {
                    agrupado[nome].diasTrabalhados.add(dataRef);
                    
                    // REGRA 2: Meta Unificada por Dia
                    // Se já definimos uma meta para este dia para esta pessoa, mantemos a maior/personalizada
                    const metaAtualNoDia = agrupado[nome].metasPorDia[dataRef] || 650;
                    const metaDestaLinha = item.meta_diaria || 650;
                    
                    // Prioriza meta personalizada
                    if (item.meta_diaria) {
                        agrupado[nome].metasPorDia[dataRef] = item.meta_diaria;
                    } else if (!agrupado[nome].metasPorDia[dataRef]) {
                        agrupado[nome].metasPorDia[dataRef] = 650;
                    }
                }
            });

            // Converte para Array Final e calcula totais de meta
            return Object.values(agrupado).map(pessoa => {
                // Soma as metas de cada dia único trabalhado
                let metaTotal = 0;
                Object.values(pessoa.metasPorDia).forEach(m => metaTotal += m);
                
                return {
                    nome: pessoa.nome,
                    dias: pessoa.diasTrabalhados.size,
                    producao: pessoa.totalProducao,
                    meta: metaTotal,
                    atingimento: metaTotal ? Math.round((pessoa.totalProducao / metaTotal) * 100) : 0,
                    mediaDiaria: pessoa.diasTrabalhados.size ? Math.round(pessoa.totalProducao / pessoa.diasTrabalhados.size) : 0
                };
            }).sort((a, b) => b.producao - a.producao); // Ordena pelo total
        }
    }
};