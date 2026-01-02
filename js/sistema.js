// js/sistema.js
const Sistema = {
    // --- MÓDULO DE DATAS GLOBAIS ---
    Datas: {
        // Chave para guardar a data no navegador
        STORAGE_KEY: 'APP_GLOBAL_DATE',

        // Configura o input para funcionar igual em todas as telas
        configurarInputGlobal: (inputId, callbackAtualizacao) => {
            const input = document.getElementById(inputId);
            if (!input) return;

            // 1. Carrega data salva ou define Hoje
            const salva = localStorage.getItem(Sistema.Datas.STORAGE_KEY);
            if (salva && salva.length === 10) {
                input.value = salva;
            } else {
                const hoje = new Date();
                input.value = Sistema.Datas.formatarDataPt(hoje);
                localStorage.setItem(Sistema.Datas.STORAGE_KEY, input.value);
            }

            // 2. Comportamentos de UX
            input.onclick = function() { this.select(); }; // Clicou, selecionou tudo
            
            input.oninput = function() {
                let v = this.value.replace(/\D/g, '').slice(0, 8);
                if (v.length >= 5) v = v.replace(/(\d{2})(\d{2})(\d{1,4})/, '$1/$2/$3');
                else if (v.length >= 3) v = v.replace(/(\d{2})(\d{1,2})/, '$1/$2');
                this.value = v;
            };

            // Ao sair ou dar Enter, salva e atualiza a tela
            const confirmar = () => {
                if (input.value.length === 10) {
                    localStorage.setItem(Sistema.Datas.STORAGE_KEY, input.value);
                    if (callbackAtualizacao) callbackAtualizacao();
                }
            };

            input.onblur = confirmar;
            input.onkeypress = (e) => { if (e.key === 'Enter') { input.blur(); } };
        },

        // Retorna Objeto Date da string "DD/MM/AAAA"
        obterDataObjeto: () => {
            const str = localStorage.getItem(Sistema.Datas.STORAGE_KEY) || Sistema.Datas.formatarDataPt(new Date());
            const parts = str.split('/');
            return new Date(parts[2], parts[1] - 1, parts[0]);
        },

        formatarDataPt: (date) => {
            const d = String(date.getDate()).padStart(2, '0');
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const a = date.getFullYear();
            return `${d}/${m}/${a}`;
        },

        // Retorna inicio e fim baseado no modo (dia, semana, mes, ano)
        getIntervalo: (modo) => {
            const ref = Sistema.Datas.obterDataObjeto();
            const ano = ref.getFullYear();
            const mes = ref.getMonth();
            const dia = ref.getDate();

            if (modo === 'dia') {
                const iso = ref.toISOString().split('T')[0];
                return { inicio: iso, fim: iso, titulo: `Dia ${dia}/${mes+1}` };
            }
            
            if (modo === 'semana') {
                // Calcula domingo e sábado da semana da data escolhida
                const diaSemana = ref.getDay(); // 0 = Dom
                const diffDom = ref.getDate() - diaSemana;
                const inicio = new Date(ref); inicio.setDate(diffDom);
                const fim = new Date(ref); fim.setDate(diffDom + 6);
                return { 
                    inicio: inicio.toISOString().split('T')[0], 
                    fim: fim.toISOString().split('T')[0],
                    titulo: `Semana de ${inicio.getDate()}/${inicio.getMonth()+1}`
                };
            }

            if (modo === 'mes') {
                const inicio = new Date(ano, mes, 1);
                const fim = new Date(ano, mes + 1, 0);
                return { 
                    inicio: inicio.toISOString().split('T')[0], 
                    fim: fim.toISOString().split('T')[0],
                    titulo: `Mês de ${mes+1}/${ano}`
                };
            }

            if (modo === 'ano') {
                return { inicio: `${ano}-01-01`, fim: `${ano}-12-31`, titulo: `Ano ${ano}` };
            }
        }
    },

    // --- MÓDULO DE DADOS E NORMALIZAÇÃO ---
    Dados: {
        mapaUsuarios: {}, // Cache de ID -> Nome/Função

        carregarUsuarios: async () => {
            if (Object.keys(Sistema.Dados.mapaUsuarios).length > 0) return;
            const { data } = await _supabase.from('usuarios').select('id, nome, funcao');
            if (data) {
                data.forEach(u => {
                    Sistema.Dados.mapaUsuarios[u.id] = { nome: u.nome, funcao: u.funcao };
                });
            }
        },

        // RECEBE DADOS BRUTOS -> RETORNA DADOS UNIFICADOS POR NOME
        // Aplica todas as tuas regras: 
        // 1. Ignora quem não é Assistente. 
        // 2. Soma IDs duplicados. 
        // 3. Meta única por dia por pessoa.
        normalizar: (dadosBrutos) => {
            const agrupado = {};

            dadosBrutos.forEach(item => {
                const u = Sistema.Dados.mapaUsuarios[item.usuario_id];
                // REGRA DE OURO: Só processa Assistentes
                if (!u || u.funcao !== 'Assistente') return;

                const nome = u.nome;
                const dia = item.data_referencia;

                if (!agrupado[nome]) {
                    agrupado[nome] = {
                        nome: nome,
                        diasTrabalhados: new Set(),
                        producaoTotal: 0,
                        metasPorDia: {}, // { "2023-01-01": 650 }
                        fifo: 0, gt: 0, gp: 0
                    };
                }

                // Soma produção (IDs duplicados somam produção)
                agrupado[nome].producaoTotal += (item.quantidade || 0);
                agrupado[nome].fifo += (item.fifo || 0);
                agrupado[nome].gt += (item.gradual_total || 0);
                agrupado[nome].gp += (item.gradual_parcial || 0);

                // Regra de Dias e Metas
                if (item.quantidade > 0) {
                    agrupado[nome].diasTrabalhados.add(dia);
                    
                    // Define a meta para este dia (Prioriza a meta personalizada se existir)
                    const metaExistente = agrupado[nome].metasPorDia[dia] || 650;
                    const metaNova = item.meta_diaria || 650;
                    
                    // Se este registro tem uma meta alterada pela gestora, ela prevalece
                    if (item.meta_diaria) {
                        agrupado[nome].metasPorDia[dia] = item.meta_diaria;
                    } else {
                        agrupado[nome].metasPorDia[dia] = metaExistente;
                    }
                }
            });

            // Transforma em Lista Final Pronta para Uso
            return Object.values(agrupado).map(p => {
                // Soma as metas dos dias únicos
                let metaConsolidada = 0;
                Object.values(p.metasPorDia).forEach(m => metaConsolidada += m);
                
                const diasCount = p.diasTrabalhados.size;

                return {
                    nome: p.nome,
                    dias: diasCount,
                    total: p.producaoTotal,
                    meta: metaConsolidada,
                    atingiu: p.producaoTotal >= metaConsolidada,
                    fifo: p.fifo, gt: p.gt, gp: p.gp,
                    // Média: Total / Dias Trabalhados (Regra Pedida)
                    media: diasCount ? Math.round(p.producaoTotal / diasCount) : 0
                };
            }).sort((a, b) => b.total - a.total);
        }
    }
};