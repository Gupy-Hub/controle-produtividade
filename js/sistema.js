const Sistema = {
    Datas: {
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

        criarInputInteligente: function(elementId, storageKey, callback) {
            const input = document.getElementById(elementId);
            if (!input) return;

            const salva = localStorage.getItem(storageKey);
            input.value = salva && salva.length === 10 ? salva : this.formatar(new Date());

            input.addEventListener('input', function() {
                let v = this.value.replace(/\D/g, '').slice(0, 8);
                if (v.length >= 5) v = v.replace(/(\d{2})(\d{2})(\d{1,4})/, '$1/$2/$3');
                else if (v.length >= 3) v = v.replace(/(\d{2})(\d{1,2})/, '$1/$2');
                this.value = v;
            });

            input.addEventListener('click', function() {
                const cursor = this.selectionStart;
                if (cursor <= 2) this.setSelectionRange(0, 2);
                else if (cursor >= 3 && cursor <= 5) this.setSelectionRange(3, 5);
                else this.setSelectionRange(6, 10);
            });

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
                input.setSelectionRange(start, end);
                input.dispatchEvent(new Event('change'));
            };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowUp') alterarData(e, 1);
                if (e.key === 'ArrowDown') alterarData(e, -1);
            });

            input.addEventListener('wheel', (e) => {
                if (document.activeElement === input) {
                    const delta = e.deltaY < 0 ? 1 : -1;
                    alterarData(e, delta);
                }
            });

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

        // Normalizar agora agrupa por NOME
        normalizar: function(listaProducao) {
            const agrupado = {};

            listaProducao.forEach(item => {
                const uid = item.usuario_id;
                const user = this.usuariosCache[uid];
                
                if (!user || user.funcao !== 'Assistente') return;

                // Chave de Agrupamento: Nome (para juntar IDs duplicados)
                const chaveNome = user.nome.trim().toUpperCase();

                if (!agrupado[chaveNome]) {
                    agrupado[chaveNome] = {
                        nome: user.nome, // Mantém a grafia original do primeiro encontrado
                        ids: new Set(),
                        diasSet: new Set(),
                        total: 0,
                        fifo: 0, gt: 0, gp: 0,
                        metaAccum: 0, // Meta acumulada (Soma das metas diárias)
                        atingiu: false,
                        ignorado: false // Controle manual de exclusão
                    };
                }

                // Adiciona o ID ao conjunto de IDs desta pessoa
                agrupado[chaveNome].ids.add(uid);

                const qtd = Number(item.quantidade) || 0;
                agrupado[chaveNome].total += qtd;
                agrupado[chaveNome].fifo += Number(item.fifo) || 0;
                agrupado[chaveNome].gt += Number(item.gradual_total) || 0;
                agrupado[chaveNome].gp += Number(item.gradual_parcial) || 0;
                
                // Evita somar meta duplicada se a pessoa tiver 2 IDs lançando produção no MESMO dia
                // (Chave única dia+nome)
                const diaUnico = item.data_referencia; 
                agrupado[chaveNome].diasSet.add(diaUnico);

                // Calcula a meta deste registro
                const metaDoDia = this.obterMetaVigente(uid, item.data_referencia);
                agrupado[chaveNome].metaAccum += metaDoDia;
            });

            return Object.values(agrupado).map(obj => {
                return {
                    nome: obj.nome,
                    ids: Array.from(obj.ids), // Lista de IDs reais
                    dias: obj.diasSet.size,
                    total: obj.total,
                    fifo: obj.fifo, gt: obj.gt, gp: obj.gp,
                    meta: obj.metaAccum,
                    atingiu: obj.total >= obj.metaAccum,
                    ignorado: false // Padrão
                };
            }).sort((a, b) => b.total - a.total);
        }
    }
};