// ARQUIVO: js/produtividade/importacao/validacao.js
window.Produtividade = window.Produtividade || {};
window.Produtividade.Importacao = window.Produtividade.Importacao || {};

window.Produtividade.Importacao.Validacao = {
    dadosProcessados: [],

    init: function() {
        console.log("🚀 Performance Pro: Importação em Massa Ativada (V2.6)");
    },

    extrairDataDoNome: function(nome) {
        const match = nome.match(/(\d{2})(\d{2})(\d{4})/);
        return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
    },

    processar: async function(input) {
        const files = Array.from(input.files);
        if (files.length === 0) return;

        this.dadosProcessados = [];
        const statusEl = document.getElementById('status-importacao-prod');
        if(statusEl) statusEl.innerHTML = `<span class="text-blue-500">Lendo arquivos...</span>`;

        for (const file of files) {
            const dataRef = this.extrairDataDoNome(file.name);
            if (!dataRef) {
                alert(`Arquivo ignorado (nome inválido): ${file.name}`);
                continue;
            }

            await new Promise(resolve => {
                Papa.parse(file, {
                    header: true, skipEmptyLines: true,
                    transformHeader: h => h.trim().toLowerCase(),
                    complete: (res) => {
                        res.data.forEach(row => {
                            let id = row['usuario_id'] || row['id_assistente'] || row['id'] || row['matrícula'];
                            if (!id) return;
                            
                            this.dadosProcessados.push({
                                usuario_id: parseInt(id.toString().replace(/\D/g, '')),
                                data_referencia: dataRef,
                                quantidade: parseInt(row['documentos_validados'] || row['quantidade'] || 0),
                                fifo: parseInt(row['fifo'] || 0),
                                gradual_total: parseInt(row['gradual_total'] || 0),
                                gradual_parcial: parseInt(row['gradual_parcial'] || 0),
                                perfil_fc: parseInt(row['perfil_fc'] || 0),
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
            if (confirm(`Localizados ${this.dadosProcessados.length} registros em ${files.length} arquivos. Gravar agora?`)) {
                this.salvarNoBanco();
            }
        }
        input.value = '';
    },

    salvarNoBanco: async function() {
        const statusEl = document.getElementById('status-importacao-prod');
        try {
            if(statusEl) statusEl.innerHTML = `<span class="text-orange-500">Sincronizando com Supabase...</span>`;

            const { error } = await Sistema.supabase
                .from('producao')
                .upsert(this.dadosProcessados, { onConflict: 'usuario_id,data_referencia' });

            if (error) throw error;

            alert("✅ Sucesso! Produção atualizada.");
            if (window.Produtividade.Geral?.carregarTela) window.Produtividade.Geral.carregarTela();
        } catch (e) {
            alert("Erro na gravação: " + e.message);
        } finally {
            if(statusEl) statusEl.innerHTML = "";
        }
    }
};

window.Produtividade.Importacao.Validacao.init();