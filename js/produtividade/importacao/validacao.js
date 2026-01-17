// ARQUIVO: js/produtividade/importacao/validacao.js
window.Produtividade = window.Produtividade || {};
window.Produtividade.Importacao = window.Produtividade.Importacao || {};

window.Produtividade.Importacao.Validacao = {
    dadosProcessados: [],

    init: function() {
        console.log("🚀 Performance Pro: Importação V2.7 (Mapeamento CSV Ajustado)");
    },

    extrairDataDoNome: function(nome) {
        // Extrai DD, MM, AAAA do nome do arquivo (ex: 01122025.csv)
        const match = nome.match(/(\d{2})(\d{2})(\d{4})/);
        return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
    },

    processar: async function(input) {
        const files = Array.from(input.files);
        if (files.length === 0) return;

        this.dadosProcessados = [];
        const statusEl = document.getElementById('status-importacao-prod');
        if(statusEl) statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Lendo arquivos...</span>`;

        for (const file of files) {
            const dataRef = this.extrairDataDoNome(file.name);
            if (!dataRef) {
                alert(`⚠️ Arquivo ignorado: "${file.name}". O nome deve conter a data (ex: 01122025.csv).`);
                continue;
            }

            await new Promise(resolve => {
                Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    encoding: "UTF-8",
                    transformHeader: h => h.trim().toLowerCase(), // Normaliza cabeçalhos para minúsculo
                    complete: (res) => {
                        this.prepararDados(res.data, dataRef);
                        resolve();
                    }
                });
            });
        }

        if (this.dadosProcessados.length > 0) {
            if (confirm(`Preparados ${this.dadosProcessados.length} registros para o dia ${this.dadosProcessados[0].data_referencia}. Gravar?`)) {
                this.salvarNoBanco();
            }
        } else {
            if(statusEl) statusEl.innerHTML = "";
            alert("Nenhum dado válido encontrado.");
        }
        input.value = '';
    },

    prepararDados: function(linhas, dataFixa) {
        linhas.forEach(row => {
            // Ignora linha de Totais ou linhas sem ID
            let id = row['id_assistente'] || row['usuario_id'] || row['id'];
            if (!id || (row['assistente'] && row['assistente'].toLowerCase() === 'total')) return;
            
            // Remove caracteres não numéricos do ID
            const usuarioId = parseInt(id.toString().replace(/\D/g, ''));
            if (isNaN(usuarioId)) return;

            this.dadosProcessados.push({
                usuario_id: usuarioId,
                data_referencia: dataFixa,
                // Mapeamento Híbrido: Tenta o nome longo do seu CSV, se não achar, tenta o curto
                quantidade: parseInt(row['documentos_validados'] || row['quantidade'] || 0),
                fifo: parseInt(row['documentos_validados_fifo'] || row['fifo'] || 0),
                gradual_total: parseInt(row['documentos_validados_gradual_total'] || row['gradual_total'] || 0),
                gradual_parcial: parseInt(row['documentos_validados_gradual_parcial'] || row['gradual_parcial'] || 0),
                perfil_fc: parseInt(row['documentos_validados_perfil_fc'] || row['perfil_fc'] || 0),
                fator: 1,
                status: 'OK'
            });
        });
    },

    salvarNoBanco: async function() {
        const statusEl = document.getElementById('status-importacao-prod');
        try {
            if(statusEl) statusEl.innerHTML = `<span class="text-orange-500"><i class="fas fa-sync fa-spin"></i> Enviando...</span>`;

            // Envia para o Supabase (requer constraint unique_user_date no banco)
            const { error } = await Sistema.supabase
                .from('producao')
                .upsert(this.dadosProcessados, { onConflict: 'usuario_id,data_referencia' });

            if (error) throw error;

            alert("✅ Importação realizada com sucesso!");
            
            // Atualiza a tela se o módulo Geral estiver carregado
            if (window.Produtividade.Geral?.carregarTela) {
                // Tenta forçar a atualização da tela para a data importada (opcional)
                // window.Produtividade.Geral.dataAtual = this.dadosProcessados[0].data_referencia;
                window.Produtividade.Geral.carregarTela();
            }

        } catch (e) {
            console.error(e);
            alert("Erro ao gravar: " + (e.message || "Verifique o console."));
        } finally {
            if(statusEl) statusEl.innerHTML = "";
        }
    }
};

window.Produtividade.Importacao.Validacao.init();