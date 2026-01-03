const Sistema = {
    Datas: {
        // Lê a data de um input ou elemento
        lerInput: function(elementIdOrNode) {
            const el = typeof elementIdOrNode === 'string' ? document.getElementById(elementIdOrNode) : elementIdOrNode;
            if (!el || el.value.length !== 10) return new Date();
            const parts = el.value.split('/');
            return new Date(parts[2], parts[1] - 1, parts[0]);
        },

        // Formata data para DD/MM/AAAA
        formatar: function(date) {
            const d = String(date.getDate()).padStart(2, '0');
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const a = date.getFullYear();
            return `${d}/${m}/${a}`;
        },

        // --- INPUT SUPER INTELIGENTE (Clique, Setas e Scroll) ---
        criarInputInteligente: function(elementId, storageKey, callback) {
            const input = document.getElementById(elementId);
            if (!input) return;

            // Carrega valor salvo ou data de hoje
            const salva = localStorage.getItem(storageKey);
            input.value = salva && salva.length === 10 ? salva : this.formatar(new Date());

            // Seleção inteligente pelo clique (Dia, Mês ou Ano)
            input.addEventListener('click', function() {
                const cursor = this.selectionStart;
                if (cursor <= 2) this.setSelectionRange(0, 2); // Dia
                else if (cursor >= 3 && cursor <= 5) this.setSelectionRange(3, 5); // Mês
                else this.setSelectionRange(6, 10); // Ano
            });

            // Máscara de digitação
            input.addEventListener('input', function() {
                let v = this.value.replace(/\D/g, '').slice(0, 8);
                if (v.length >= 5) v = v.replace(/(\d{2})(\d{2})(\d{1,4})/, '$1/$2/$3');
                else if (v.length >= 3) v = v.replace(/(\d{2})(\d{1,2})/, '$1/$2');
                this.value = v;
            });

            // Lógica de alteração de data
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
                input.setSelectionRange(start, end); // Mantém a seleção
                input.dispatchEvent(new Event('change'));
            };

            // Teclado (Setas)
            input.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowUp') alterarData(e, 1);
                if (e.key === 'ArrowDown') alterarData(e, -1);
            });

            // Mouse (Scroll)
            input.addEventListener('wheel', (e) => {
                if (document.activeElement === input) {
                    const delta = e.deltaY < 0 ? 1 : -1;
                    alterarData(e, delta);
                }
            });

            // Salvar ao mudar
            input.addEventListener('change', function() {
                if (this.value.length === 10) {
                    localStorage.setItem(storageKey, this.value);
                    if (typeof callback === 'function') callback();
                }
            });

            // Enter tira o foco
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
        fatoresCache: {}, // Cache para guardar os ajustes (0, 0.5, 1)

        inicializar: async function() {
            // Carrega fatores salvos no LocalStorage
            const saved = localStorage.getItem('produtividade_fatores_v2');
            this.fatoresCache = saved ? JSON.parse(saved) : {};

            if (!window._supabase) { console.error("Supabase Off"); return; }
            
            // Carrega TODOS os usuários para evitar que alguém suma
            const { data: users } = await _supabase.from('usuarios').select('id, nome, funcao');
            this.usuariosCache = {};
            if(users) users.forEach(u => this.usuariosCache[u.id] = u);
            
            const { data: metas } = await _supabase.from('metas').select('*').order('data_inicio', { ascending: false });
            this.metasCache = metas || [];
        },

        // Define e Salva o Fator (Ex: Maria trabalhou 50% no dia 2025-01-01)
        definirFator: function(nome, dataRef, fator) {
            if (!this.fatoresCache[dataRef]) this.fatoresCache[dataRef] = {};
            this.fatoresCache[dataRef][nome] = parseFloat(fator);
            localStorage.setItem('produtividade_fatores_v2', JSON.stringify(this.fatoresCache));
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

        // Função Principal de Processamento
        normalizar: function(listaProducao) {
            const agrupado = {};

            listaProducao.forEach(item => {
                const uid = item.usuario_id;
                let user = this.usuariosCache[uid];
                
                // PROTEÇÃO: Se o usuário não existir no cache, cria um provisório
                if (!user) {
                    user = { id: uid, nome: `Desconhecido (ID ${uid})`, funcao: 'Assistente' };
                }
                
                // Filtro de segurança (Opcional, se quiser ver todos comente a linha abaixo)
                if (user.funcao && user.funcao !== 'Assistente') return;

                // Agrupa pelo NOME para juntar IDs duplicados
                const nomeChave = user.nome.trim();

                if (!agrupado[nomeChave]) {
                    agrupado[nomeChave] = {
                        nome: user.nome,
                        ids: new Set(),
                        // Armazena detalhes por dia para aplicar o fator corretamente
                        diasMap: {}, 
                        total: 0, fifo: 0, gt: 0, gp: 0,
                        metaAccum: 0
                    };
                }

                agrupado[nomeChave].ids.add(uid);

                // Soma produção bruta
                const qtd = Number(item.quantidade) || 0;
                agrupado[nomeChave].total += qtd;
                agrupado[nomeChave].fifo += Number(item.fifo) || 0;
                agrupado[nomeChave].gt += Number(item.gradual_total) || 0;
                agrupado[nomeChave].gp += Number(item.gradual_parcial) || 0;

                // Registra o dia e a meta original desse dia
                const dia = item.data_referencia;
                if (!agrupado[nomeChave].diasMap[dia]) {
                    agrupado[nomeChave].diasMap[dia] = {
                        metaBase: this.obterMetaVigente(uid, dia),
                        fator: this.obterFator(user.nome, dia)
                    };
                }
            });

            // Processa os totais baseados nos fatores (0, 0.5, 1)
            return Object.values(agrupado).map(obj => {
                let diasContabilizados = 0;
                let metaTotal = 0;

                // Percorre cada dia trabalhado por essa pessoa
                Object.values(obj.diasMap).forEach(d => {
                    diasContabilizados += d.fator; // Soma 1, 0.5 ou 0
                    metaTotal += (d.metaBase * d.fator); // Ajusta a meta (Ex: 650 * 0.5 = 325)
                });

                return {
                    nome: obj.nome,
                    ids: Array.from(obj.ids),
                    dias: diasContabilizados, // Pode ser quebrado (Ex: 10.5)
                    total: obj.total,
                    fifo: obj.fifo, gt: obj.gt, gp: obj.gp,
                    meta: Math.round(metaTotal),
                    atingiu: obj.total >= metaTotal,
                    // Se a soma de dias for 0 (todos dias zerados), considera inativo para médias
                    inativo: diasContabilizados === 0
                };
            }).sort((a, b) => b.total - a.total);
        }
    }
};