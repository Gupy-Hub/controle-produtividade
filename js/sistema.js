const Sistema = {
    Datas: {
        // Lê data de string ou do próprio elemento
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

        // --- INPUT SUPER INTELIGENTE (ATUALIZADO) ---
        criarInputInteligente: function(elementId, storageKey, callback) {
            const input = document.getElementById(elementId);
            if (!input) return;

            // 1. Carregar Valor Inicial
            const salva = localStorage.getItem(storageKey);
            input.value = salva && salva.length === 10 ? salva : this.formatar(new Date());

            // 2. Máscara de Digitação (Permite digitar livremente)
            input.addEventListener('input', function() {
                let v = this.value.replace(/\D/g, '').slice(0, 8);
                if (v.length >= 5) v = v.replace(/(\d{2})(\d{2})(\d{1,4})/, '$1/$2/$3');
                else if (v.length >= 3) v = v.replace(/(\d{2})(\d{1,2})/, '$1/$2');
                this.value = v;
            });

            // 3. SELEÇÃO INTELIGENTE AO CLICAR (CORREÇÃO PEDIDA)
            input.addEventListener('click', function() {
                const cursor = this.selectionStart;
                
                // Define qual parte selecionar baseado no clique
                if (cursor <= 2) {
                    this.setSelectionRange(0, 2); // Seleciona DIA (dd)
                } else if (cursor >= 3 && cursor <= 5) {
                    this.setSelectionRange(3, 5); // Seleciona MÊS (mm)
                } else {
                    this.setSelectionRange(6, 10); // Seleciona ANO (aaaa)
                }
            });

            // 4. Lógica Central de Alteração (Setas e Scroll)
            const alterarData = (e, delta) => {
                e.preventDefault();
                
                // Detecta onde está a seleção/cursor
                const cursor = input.selectionStart;
                let mode = 'day'; 
                let start = 0, end = 2;

                if (cursor >= 3 && cursor <= 5) { mode = 'month'; start = 3; end = 5; }
                if (cursor >= 6) { mode = 'year'; start = 6; end = 10; }

                let atual = Sistema.Datas.lerInput(input);
                
                // Altera apenas a parte onde o cursor está
                if (mode === 'day') atual.setDate(atual.getDate() + delta);
                if (mode === 'month') atual.setMonth(atual.getMonth() + delta);
                if (mode === 'year') atual.setFullYear(atual.getFullYear() + delta);

                input.value = Sistema.Datas.formatar(atual);
                
                // Mantém a seleção na parte que estava sendo editada
                input.setSelectionRange(start, end);
                
                // Salva e atualiza a tela
                input.dispatchEvent(new Event('change'));
            };

            // Evento: Setas do Teclado
            input.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowUp') alterarData(e, 1);
                if (e.key === 'ArrowDown') alterarData(e, -1);
            });

            // Evento: Rodinha do Mouse (Scroll)
            input.addEventListener('wheel', (e) => {
                if (document.activeElement === input) {
                    const delta = e.deltaY < 0 ? 1 : -1;
                    alterarData(e, delta);
                }
            });

            // 5. Salvar ao Confirmar
            input.addEventListener('change', function() {
                if (this.value.length === 10) {
                    localStorage.setItem(storageKey, this.value);
                    if (typeof callback === 'function') callback();
                }
            });

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

        inicializar: async function() {
            if (!window._supabase) { console.error("Supabase Off"); return; }
            const { data: users } = await _supabase.from('usuarios').select('id, nome, funcao');
            this.usuariosCache = {};
            if(users) users.forEach(u => this.usuariosCache[u.id] = u);
            const { data: metas } = await _supabase.from('metas').select('*').order('data_inicio', { ascending: false });
            this.metasCache = metas || [];
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
                const user = this.usuariosCache[uid];
                if (!user || user.funcao !== 'Assistente') return;

                if (!agrupado[uid]) {
                    agrupado[uid] = { nome: user.nome, diasSet: new Set(), total: 0, fifo: 0, gt: 0, gp: 0, metaAccum: 0, atingiu: false };
                }
                const qtd = Number(item.quantidade) || 0;
                agrupado[uid].total += qtd;
                agrupado[uid].fifo += Number(item.fifo) || 0;
                agrupado[uid].gt += Number(item.gradual_total) || 0;
                agrupado[uid].gp += Number(item.gradual_parcial) || 0;
                agrupado[uid].diasSet.add(item.data_referencia);

                const metaDoDia = this.obterMetaVigente(uid, item.data_referencia);
                agrupado[uid].metaAccum += metaDoDia;
            });

            return Object.values(agrupado).map(obj => {
                return {
                    nome: obj.nome, dias: obj.diasSet.size, total: obj.total, fifo: obj.fifo, gt: obj.gt, gp: obj.gp, meta: obj.metaAccum, atingiu: obj.total >= obj.metaAccum
                };
            }).sort((a, b) => b.total - a.total);
        }
    }
};