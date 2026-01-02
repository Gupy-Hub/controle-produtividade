// js/sistema.js
const Sistema = {
    Datas: {
        STORAGE_KEY: 'APP_GLOBAL_DATE',

        configurarInputGlobal: (inputId, callback) => {
            const input = document.getElementById(inputId);
            if (!input) return;

            const salvo = localStorage.getItem(Sistema.Datas.STORAGE_KEY);
            // Se não tiver data salva, usa o dia 1 do mês atual como padrão inicial
            if (salvo && salvo.length === 10) {
                input.value = salvo;
            } else {
                const hoje = new Date();
                input.value = Sistema.Datas.formatarDataPt(hoje);
                localStorage.setItem(Sistema.Datas.STORAGE_KEY, input.value);
            }

            input.onclick = function() { this.select(); };
            input.oninput = function() {
                let v = this.value.replace(/\D/g, '').slice(0, 8);
                if (v.length >= 5) v = v.replace(/(\d{2})(\d{2})(\d{1,4})/, '$1/$2/$3');
                else if (v.length >= 3) v = v.replace(/(\d{2})(\d{1,2})/, '$1/$2');
                this.value = v;
            };
            
            const confirmar = () => {
                if (input.value.length === 10) {
                    localStorage.setItem(Sistema.Datas.STORAGE_KEY, input.value);
                    if (callback) callback();
                }
            };
            input.onblur = confirmar;
            input.onkeypress = (e) => { if (e.key === 'Enter') input.blur(); };
        },

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

        // Função auxiliar para saber a semana do mês
        getSemanaDoMes: (dataString) => {
            const d = new Date(dataString + 'T12:00:00');
            const date = d.getDate();
            const day = d.getDay();
            return Math.ceil((date - 1 - day) / 7) + 1;
        }
    },

    Dados: {
        mapaUsuarios: {},

        carregarUsuarios: async () => {
            if (Object.keys(Sistema.Dados.mapaUsuarios).length > 0) return;
            const { data } = await _supabase.from('usuarios').select('id, nome, funcao');
            if (data) {
                data.forEach(u => {
                    Sistema.Dados.mapaUsuarios[u.id] = { nome: u.nome, funcao: u.funcao };
                });
            }
        },

        // Normalização que mantém os detalhes (FIFO, Gradual, etc)
        normalizar: (dadosBrutos) => {
            const agrupado = {};

            dadosBrutos.forEach(item => {
                const u = Sistema.Dados.mapaUsuarios[item.usuario_id];
                // Regra: Apenas Assistentes e dados importados/reais
                if (!u || u.funcao !== 'Assistente') return;

                const nome = u.nome;
                const dia = item.data_referencia;

                if (!agrupado[nome]) {
                    agrupado[nome] = {
                        nome: nome,
                        diasTrabalhados: new Set(),
                        producaoTotal: 0,
                        metasPorDia: {},
                        fifo: 0, gt: 0, gp: 0, perfil_fc: 0
                    };
                }

                // Soma tudo (IDs duplicados somam)
                agrupado[nome].producaoTotal += (item.quantidade || 0);
                agrupado[nome].fifo += (item.fifo || 0);
                agrupado[nome].gt += (item.gradual_total || 0);
                agrupado[nome].gp += (item.gradual_parcial || 0);
                agrupado[nome].perfil_fc += (item.perfil_fc || 0);

                if (item.quantidade > 0) {
                    agrupado[nome].diasTrabalhados.add(dia);
                    // Meta: Prioriza personalizada
                    const metaExistente = agrupado[nome].metasPorDia[dia] || 650;
                    if (item.meta_diaria) agrupado[nome].metasPorDia[dia] = item.meta_diaria;
                    else agrupado[nome].metasPorDia[dia] = metaExistente;
                }
            });

            return Object.values(agrupado).map(p => {
                let metaTotal = 0;
                Object.values(p.metasPorDia).forEach(m => metaTotal += m);
                const dias = p.diasTrabalhados.size;

                return {
                    nome: p.nome,
                    dias: dias,
                    total: p.producaoTotal,
                    meta: metaTotal,
                    atingiu: p.producaoTotal >= metaTotal,
                    media: dias ? Math.round(p.producaoTotal / dias) : 0,
                    // Detalhes para Consolidado/Produtividade
                    fifo: p.fifo,
                    gt: p.gt,
                    gp: p.gp,
                    perfil_fc: p.perfil_fc
                };
            }).sort((a, b) => b.total - a.total);
        }
    }
};