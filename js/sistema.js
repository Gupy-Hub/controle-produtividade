const Sistema = {
    Datas: {
        criarInputInteligente: function(elementId, storageKey, callback) {
            const input = document.getElementById(elementId);
            if (!input) return;
            const salva = localStorage.getItem(storageKey);
            input.value = (salva && salva.length === 10) ? salva : new Date().toISOString().split('T')[0];
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
        fatoresCache: {}, 
        motivosCache: {},
        basesHcCache: {}, 
        inicializado: false,

        inicializar: async function() {
            try {
                const savedFator = localStorage.getItem('produtividade_fatores_v2');
                this.fatoresCache = savedFator ? JSON.parse(savedFator) : {};

                const savedMotivos = localStorage.getItem('produtividade_motivos_v1');
                this.motivosCache = savedMotivos ? JSON.parse(savedMotivos) : {};

                const savedBase = localStorage.getItem('produtividade_bases_hc_v2');
                this.basesHcCache = savedBase ? JSON.parse(savedBase) : {};
            } catch(e) {
                console.warn("Erro ao ler localStorage", e);
            }

            if (this.inicializado) return; 
            if (!window._supabase) return;
            
            try {
                const { data: users, error: errUser } = await _supabase.from('usuarios').select('id, nome, funcao, contrato, ativo').order('nome');
                if (errUser) throw errUser;
                this.usuariosCache = {};
                if(users) users.forEach(u => this.usuariosCache[u.id] = u);
                
                const { data: metas, error: errMeta } = await _supabase.from('metas').select('*').order('data_inicio', { ascending: false });
                if (errMeta) throw errMeta;
                this.metasCache = metas || [];
                
                this.inicializado = true;
            } catch (e) { console.error("Erro Sistema:", e); }
        },

        definirFator: function(nome, dataRef, fator) {
            if (!this.fatoresCache[dataRef]) this.fatoresCache[dataRef] = {};
            this.fatoresCache[dataRef][nome] = parseFloat(fator);
            localStorage.setItem('produtividade_fatores_v2', JSON.stringify(this.fatoresCache));
        },

        obterFator: function(nome, dataRef) {
            if (this.fatoresCache[dataRef] && this.fatoresCache[dataRef][nome] !== undefined) return this.fatoresCache[dataRef][nome];
            return 1.0; 
        },

        definirMotivo: function(nome, dataRef, motivo) {
            if (!this.motivosCache[dataRef]) this.motivosCache[dataRef] = {};
            if (motivo && motivo.trim() !== "") this.motivosCache[dataRef][nome] = motivo;
            else delete this.motivosCache[dataRef][nome];
            localStorage.setItem('produtividade_motivos_v1', JSON.stringify(this.motivosCache));
        },

        obterMotivo: function(nome, dataRef) {
            if (this.motivosCache[dataRef] && this.motivosCache[dataRef][nome]) return this.motivosCache[dataRef][nome];
            return "";
        },

        obterBaseHC: function(dataRef) {
            if(!dataRef) return 17;
            const key = dataRef.substring(0, 7);
            return this.basesHcCache[key] !== undefined ? this.basesHcCache[key] : 17;
        },
        
        definirBaseHC: function(dataRef, quantidade) {
            if(!dataRef) return;
            const key = dataRef.substring(0, 7); 
            if (!quantidade || parseInt(quantidade) === 17) delete this.basesHcCache[key]; 
            else this.basesHcCache[key] = parseInt(quantidade);
            localStorage.setItem('produtividade_bases_hc_v2', JSON.stringify(this.basesHcCache));
        }
    }
};