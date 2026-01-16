// ARQUIVO: js/produtividade/importacao/validacao.js
window.Produtividade = window.Produtividade || {};
window.Produtividade.Importacao = window.Produtividade.Importacao || {};

Produtividade.Importacao.Validacao = {
    dadosProcessados: [],
    arquivosPendentes: 0,
    
    init: function() {
        console.log("📥 Importação de Produção: Engine V2 (Multi-File & Upsert)");
    },

    /**
     * Processa um ou mais arquivos CSV selecionados
     * @param {HTMLInputElement} input 
     */
    processar: async function(input) {
        const files = Array.from(input.files);
        if (files.length === 0) return;

        this.dadosProcessados = [];
        this.arquivosPendentes = files.length;
        
        const statusEl = document.getElementById('status-importacao-prod');
        if(statusEl) statusEl.classList.remove('hidden');

        for (const file of files) {
            if(statusEl) statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Lendo ${file.name}...</span>`;
            
            const dataArquivo = this.extrairDataDoNome(file.name);
            if (!dataArquivo) {
                alert(`⚠️ ERRO: O arquivo "${file.name}" deve seguir o padrão DDMMAAAA.csv (ex: 15012026.csv)`);
                continue;
            }

            await new Promise((resolve) => {
                Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    encoding: "UTF-8",
                    transformHeader: h => h.trim().toLowerCase(),
                    complete: (results) => {
                        this.prepararDados(results.data, dataArquivo);
                        resolve();
                    }
                });
            });
        }

        this.finalizarAnalise();
        input.value = ''; // Limpa input
    },

    extrairDataDoNome: function(nome) {
        const match = nome.match(/(\d{2})(\d{2})(\d{4})/);
        if (match) {
            const [_, dia, mes, ano] = match;
            if (parseInt(mes) > 12 || parseInt(dia) > 31) return null;
            return `${ano}-${mes}-${dia}`;
        }
        return null;
    },

    prepararDados: function(linhas, dataFixa) {
        linhas.forEach(row => {
            // Normalização de colunas (id_assistente, id ou usuario_id)
            let idRaw = row['id_assistente'] || row['id'] || row['usuario_id'];
            if (!idRaw || (row['assistente'] && row['assistente'].toLowerCase() === 'total')) return;

            const usuarioId = parseInt(idRaw.toString().replace(/\D/g, ''));
            if (!usuarioId) return;

            // Quantidade (validados ou quantidade direta)
            const quantidade = parseInt(row['documentos_validados'] || row['quantidade'] || row['qtd'] || 1);

            this.dadosProcessados.push({
                usuario_id: usuarioId,
                data_referencia: dataFixa,
                quantidade: quantidade,
                fifo: parseInt(row['fifo'] || 0),
                gradual_total: parseInt(row['gradual_total'] || row['gradual total'] || 0),
                gradual_parcial: parseInt(row['gradual_parcial'] || row['gradual parcial'] || 0),
                perfil_fc: parseInt(row['perfil_fc'] || row['perfil fc'] || 0),
                fator: 1,
                status: (row['status'] || 'OK').toUpperCase().includes('NOK') ? 'NOK' : 'OK'
            });
        });
    },

    finalizarAnalise: function() {
        const statusEl = document.getElementById('status-importacao-prod');
        if (this.dadosProcessados.length === 0) {
            alert("Nenhum dado válido encontrado nos arquivos.");
            if(statusEl) statusEl.innerHTML = "";
            return;
        }

        const datasAfetadas = [...new Set(this.dadosProcessados.map(d => d.data_referencia))].sort();
        const msg = `Resumo da Importação:\n\n` +
                    `📁 Arquivos: ${this.arquivosPendentes}\n` +
                    `📊 Registros Totais: ${this.dadosProcessados.length}\n` +
                    `📅 Dias afetados: ${datasAfetadas.join(', ')}\n\n` +
                    `Deseja gravar os dados? (Registros existentes nas mesmas datas serão atualizados)`;

        if (confirm(msg)) {
            this.salvarNoBanco();
        } else if(statusEl) {
            statusEl.innerHTML = "";
        }
    },

    salvarNoBanco: async function() {
        const statusEl = document.getElementById('status-importacao-prod');
        const BATCH_SIZE = 500;
        const total = this.dadosProcessados.length;
        let enviados = 0;

        try {
            for (let i = 0; i < total; i += BATCH_SIZE) {
                const chunk = this.dadosProcessados.slice(i, i + BATCH_SIZE);
                
                // Usamos UPSERT para permitir importação individual ou em massa sem duplicar
                // Requer constraint UNIQUE em (usuario_id, data_referencia) na tabela 'producao'
                const { error } = await Sistema.supabase
                    .from('producao')
                    .upsert(chunk, { onConflict: 'usuario_id,data_referencia' });

                if (error) throw error;

                enviados += chunk.length;
                if(statusEl) {
                    const pct = Math.round((enviados/total)*100);
                    statusEl.innerHTML = `<span class="text-orange-600 font-bold"><i class="fas fa-sync fa-spin"></i> Gravando: ${pct}%</span>`;
                }
            }

            if(statusEl) statusEl.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fas fa-check"></i> Importado!</span>`;
            alert("Importação concluída com sucesso!");
            
            // Recarrega a tela se estiver na aba geral
            if (Produtividade.Geral && Produtividade.Geral.carregarTela) {
                Produtividade.Geral.carregarTela();
            }

        } catch (e) {
            console.error("Erro no salvamento:", e);
            alert("Erro ao salvar no banco: " + e.message);
        } finally {
            setTimeout(() => { if(statusEl) statusEl.innerHTML = ""; }, 3000);
        }
    }
};