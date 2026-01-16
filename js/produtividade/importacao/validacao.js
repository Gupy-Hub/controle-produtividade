// ARQUIVO: js/produtividade/importacao/validacao.js

// Garante a existência dos namespaces sem erros de inicialização
if (typeof window.Produtividade === 'undefined') window.Produtividade = {};
if (typeof window.Produtividade.Importacao === 'undefined') window.Produtividade.Importacao = {};

window.Produtividade.Importacao.Validacao = {
    dadosProcessados: [],
    arquivosPendentes: 0,
    
    init: function() {
        console.log("📥 Importação de Produção: Engine V2.1 (Fixed Syntax)");
    },

    /**
     * Extrai data do nome do arquivo DDMMAAAA.csv
     */
    extrairDataDoNome: function(nome) {
        const match = nome.match(/(\d{2})(\d{2})(\d{4})/);
        if (match) {
            const [_, dia, mes, ano] = match;
            return `${ano}-${mes}-${dia}`;
        }
        return null;
    },

    /**
     * Processa a fila de arquivos
     */
    processar: async function(input) {
        const files = Array.from(input.files);
        if (files.length === 0) return;

        this.dadosProcessados = [];
        this.arquivosPendentes = files.length;
        
        const statusEl = document.getElementById('status-importacao-prod');
        if(statusEl) statusEl.classList.remove('hidden');

        try {
            for (const file of files) {
                if(statusEl) statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Lendo ${file.name}...</span>`;
                
                const dataArquivo = this.extrairDataDoNome(file.name);
                if (!dataArquivo) {
                    alert(`⚠️ Nome inválido: ${file.name}. Use o padrão DDMMAAAA.csv`);
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
            console.error("Erro no processamento de arquivos:", err);
            alert("Erro ao ler arquivos CSV.");
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

            const quantidade = parseInt(row['documentos_validados'] || row['quantidade'] || row['qtd'] || 0);

            this.dadosProcessados.push({
                usuario_id: usuarioId,
                data_referencia: dataFixa,
                quantidade: quantidade,
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
            alert("Nenhum dado válido encontrado.");
            return;
        }

        const confirmacao = confirm(`Processados ${this.dadosProcessados.length} registros. Confirmar gravação no banco?`);
        if (confirmacao) {
            this.salvarNoBanco();
        }
    },

    salvarNoBanco: async function() {
        const statusEl = document.getElementById('status-importacao-prod');
        
        try {
            // Verificação de segurança da sessão
            const { data: { session } } = await Sistema.supabase.auth.getSession();
            if (!session) throw new Error("Sessão expirada.");

            if(statusEl) statusEl.innerHTML = `<span class="text-orange-500"><i class="fas fa-sync fa-spin"></i> Gravando...</span>`;

            const { error } = await Sistema.supabase
                .from('producao')
                .upsert(this.dadosProcessados, { 
                    onConflict: 'usuario_id,data_referencia' 
                });

            if (error) throw error;

            alert("✅ Dados importados com sucesso!");
            if (window.Produtividade.Geral?.carregarTela) window.Produtividade.Geral.carregarTela();

        } catch (e) {
            console.error("Erro no Upsert:", e);
            alert("Erro: " + (e.message || "Falha na comunicação com Supabase"));
        } finally {
            if(statusEl) statusEl.innerHTML = "";
        }
    }
};

// Auto-inicialização
Produtividade.Importacao.Validacao.init();