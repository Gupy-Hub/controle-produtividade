// ARQUIVO: js/produtividade/importacao/validacao.js

// Inicialização segura dos Namespaces
window.Produtividade = window.Produtividade || {};
window.Produtividade.Importacao = window.Produtividade.Importacao || {};

window.Produtividade.Importacao.Validacao = {
    dadosProcessados: [],

    init: function() {
        console.log("📥 Importação de Produção: Engine V2.2 (Sintaxe e Sessão)");
    },

    extrairDataDoNome: function(nome) {
        const match = nome.match(/(\d{2})(\d{2})(\d{4})/);
        if (match) {
            const [_, dia, mes, ano] = match;
            return `${ano}-${mes}-${dia}`;
        }
        return null;
    },

    processar: async function(input) {
        const files = Array.from(input.files);
        if (files.length === 0) return;

        this.dadosProcessados = [];
        const statusEl = document.getElementById('status-importacao-prod');
        if(statusEl) statusEl.classList.remove('hidden');

        try {
            for (const file of files) {
                if(statusEl) statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Lendo ${file.name}...</span>`;
                
                const dataArquivo = this.extrairDataDoNome(file.name);
                if (!dataArquivo) {
                    alert(`⚠️ Arquivo inválido: ${file.name}. Use DDMMAAAA.csv`);
                    continue;
                }

                await new Promise((resolve, reject) => {
                    Papa.parse(file, {
                        header: true,
                        skipEmptyLines: true,
                        encoding: "UTF-8",
                        transformHeader: h => h.trim().toLowerCase(),
                        complete: (results) => {
                            this.prepararDados(results.data, dataArquivo);
                            resolve();
                        },
                        error: (err) => reject(err)
                    });
                });
            }
            this.finalizarAnalise();
        } catch (err) {
            console.error("Erro na leitura:", err);
        } finally {
            input.value = '';
        }
    },

    prepararDados: function(linhas, dataFixa) {
        linhas.forEach(row => {
            let idRaw = row['id_assistente'] || row['id'] || row['usuario_id'] || row['id assistente'];
            if (!idRaw) return;

            const usuarioId = parseInt(idRaw.toString().replace(/\D/g, ''));
            if (isNaN(usuarioId)) return;

            this.dadosProcessados.push({
                usuario_id: usuarioId,
                data_referencia: dataFixa,
                quantidade: parseInt(row['documentos_validados'] || row['quantidade'] || row['qtd'] || 0),
                fifo: parseInt(row['fifo'] || 0),
                gradual_total: parseInt(row['gradual_total'] || row['gradual total'] || 0),
                gradual_parcial: parseInt(row['gradual_parcial'] || row['gradual parcial'] || 0),
                perfil_fc: parseInt(row['perfil_fc'] || row['perfil fc'] || 0),
                fator: 1,
                status: 'OK'
            });
        });
    },

    finalizarAnalise: function() {
        if (this.dadosProcessados.length === 0) {
            alert("Nenhum dado válido extraído.");
            return;
        }
        if (confirm(`Deseja salvar ${this.dadosProcessados.length} registros no banco?`)) {
            this.salvarNoBanco();
        }
    },

    salvarNoBanco: async function() {
        const statusEl = document.getElementById('status-importacao-prod');
        try {
            if(statusEl) statusEl.innerHTML = `<span class="text-orange-500">Sincronizando...</span>`;

            // Tenta obter sessão de forma direta
            const { data: { session } } = await Sistema.supabase.auth.getSession();
            
            if (!session) {
                // Tenta um fallback buscando o usuário
                const { data: { user } } = await Sistema.supabase.auth.getUser();
                if (!user) throw new Error("Usuário não autenticado. Faça login novamente.");
            }

            const { error } = await Sistema.supabase
                .from('producao')
                .upsert(this.dadosProcessados, { 
                    onConflict: 'usuario_id,data_referencia' 
                });

            if (error) throw error;

            alert("✅ Importação concluída!");
            if (window.Produtividade.Geral?.carregarTela) window.Produtividade.Geral.carregarTela();

        } catch (e) {
            console.error("Erro no Supabase:", e);
            alert("Erro: " + (e.message || "Falha na conexão"));
        } finally {
            if(statusEl) statusEl.innerHTML = "";
        }
    }
};

// Inicialização imediata
window.Produtividade.Importacao.Validacao.init();