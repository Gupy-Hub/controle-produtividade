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
            if(statusEl) statusEl.innerHTML = `<span class="text-orange-500"><i class="fas fa-spinner fa-spin"></i> Verificando conexão...</span>`;

            // 1. Tenta obter a sessão atualizada
            const { data, error: sessionError } = await Sistema.supabase.auth.getSession();
            
            if (sessionError || !data.session) {
                console.error("Erro de sessão:", sessionError);
                throw new Error("Sessão inválida ou expirada. Por favor, atualize a página (F5) ou refaça o login.");
            }

            if(statusEl) statusEl.innerHTML = `<span class="text-orange-500"><i class="fas fa-sync fa-spin"></i> Gravando ${this.dadosProcessados.length} registros...</span>`;

            // 2. Executa o Upsert
            const { error: upsertError } = await Sistema.supabase
                .from('producao')
                .upsert(this.dadosProcessados, { 
                    onConflict: 'usuario_id,data_referencia' 
                });

            if (upsertError) {
                // Se o erro for 401 mesmo com sessão, é falta de política RLS no banco
                if (upsertError.status === 401 || upsertError.code === "42501") {
                    throw new Error("Permissão Negada (RLS). O banco não permite gravação para seu usuário.");
                }
                throw upsertError;
            }

            // 3. Sucesso
            if(statusEl) statusEl.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fas fa-check"></i> Importado com Sucesso!</span>`;
            alert("✅ Dados sincronizados com o Supabase!");
            
            if (window.Produtividade.Geral && typeof window.Produtividade.Geral.carregarTela === 'function') {
                window.Produtividade.Geral.carregarTela();
            }

        } catch (e) {
            console.error("Falha na Operação:", e);
            alert("❌ Erro: " + e.message);
            if(statusEl) statusEl.innerHTML = `<span class="text-red-600 font-bold">Falha: ${e.message}</span>`;
        } finally {
            // Limpa o status após 5 segundos
            setTimeout(() => { if(statusEl) statusEl.innerHTML = ""; }, 5000);
        }
    }

// Auto-inicialização
Produtividade.Importacao.Validacao.init();