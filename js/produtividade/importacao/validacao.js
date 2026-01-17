// ARQUIVO: js/produtividade/importacao/validacao.js
window.Produtividade = window.Produtividade || {};
window.Produtividade.Importacao = window.Produtividade.Importacao || {};

window.Produtividade.Importacao.Validacao = {
    dadosProcessados: [],

    init: function() {
        console.log("🚀 Performance Pro: Importação em Massa Ativada (V2.6)");
    },

    /**
     * Extrai a data do nome do arquivo (padrão DDMMAAAA)
     */
    extrairDataDoNome: function(nome) {
        const match = nome.match(/(\d{2})(\d{2})(\d{4})/);
        return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
    },

    /**
     * Processa um ou mais arquivos CSV selecionados
     */
    processar: async function(input) {
        const files = Array.from(input.files);
        if (files.length === 0) return;

        this.dadosProcessados = [];
        const statusEl = document.getElementById('status-importacao-prod');
        if(statusEl) {
            statusEl.classList.remove('hidden');
            statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Lendo arquivos...</span>`;
        }

        for (const file of files) {
            const dataRef = this.extrairDataDoNome(file.name);
            if (!dataRef) {
                alert(`Arquivo ignorado (nome inválido): ${file.name}. Use DDMMAAAA.csv`);
                continue;
            }

            await new Promise(resolve => {
                Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    transformHeader: h => h.trim().toLowerCase(),
                    complete: (res) => {
                        res.data.forEach(row => {
                            // Identifica o ID ignorando linhas de 'Total'
                            let id = row['id_assistente'] || row['usuario_id'] || row['id'];
                            if (!id || (row['assistente'] && row['assistente'].toLowerCase() === 'total')) return;
                            
                            this.dadosProcessados.push({
                                usuario_id: parseInt(id.toString().replace(/\D/g, '')),
                                data_referencia: dataRef,
                                quantidade: parseInt(row['documentos_validados'] || 0),
                                fifo: parseInt(row['documentos_validados_fifo'] || 0),
                                gradual_total: parseInt(row['documentos_validados_gradual_total'] || 0),
                                gradual_parcial: parseInt(row['documentos_validados_gradual_parcial'] || 0),
                                perfil_fc: parseInt(row['documentos_validados_perfil_fc'] || 0),
                                fator: 1,
                                status: 'OK'
                            });
                        });
                        resolve();
                    }
                });
            });
        }

        if (this.dadosProcessados.length > 0) {
            if (confirm(`Localizados ${this.dadosProcessados.length} registros em ${files.length} arquivo(s). Gravar agora?`)) {
                this.salvarNoBanco();
            }
        } else {
            alert("Nenhum dado válido encontrado para importação.");
        }
        input.value = '';
    },

    /**
     * Envia os dados acumulados para o Supabase via UPSERT
     */
    salvarNoBanco: async function() {
        const statusEl = document.getElementById('status-importacao-prod');
        try {
            if(statusEl) statusEl.innerHTML = `<span class="text-orange-500"><i class="fas fa-sync fa-spin"></i> Sincronizando com Supabase...</span>`;

            // O upsert lida com a atualização se (usuario_id, data_referencia) já existir
            const { error } = await Sistema.supabase
                .from('producao')
                .upsert(this.dadosProcessados, { onConflict: 'usuario_id,data_referencia' });

            if (error) throw error;

            alert("✅ Sucesso! Produção atualizada.");
            if (window.Produtividade.Geral && typeof window.Produtividade.Geral.carregarTela === 'function') {
                window.Produtividade.Geral.carregarTela();
            }
        } catch (e) {
            console.error("Erro na gravação:", e);
            alert("Erro na gravação: " + (e.message || "Acesso negado (RLS)"));
        } finally {
            if(statusEl) statusEl.innerHTML = "";
        }
    }
};

// Inicializa o módulo
window.Produtividade.Importacao.Validacao.init();