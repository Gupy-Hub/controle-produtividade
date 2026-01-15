window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

Gestao.Importacao.Assertividade = {
    init: function() {
        // Garante que o input existe e remove listeners antigos para evitar disparos múltiplos
        const input = document.getElementById('input-csv-assertividade');
        if (input) {
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);
            
            newInput.addEventListener('change', (e) => {
                if(e.target.files.length > 0) this.processarArquivo(e.target.files[0]);
            });
        }
    },

    processarArquivo: function(file) {
        if (!file) return;

        const btn = document.getElementById('btn-importar-assert');
        const statusEl = document.getElementById('status-importacao-assert');
        
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analisando...';
        if(statusEl) statusEl.innerHTML = '<span class="text-blue-500">Lendo arquivo...</span>';

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8",
            // Remove BOM e limpa cabeçalhos para evitar erros de caractere invisível
            transformHeader: function(h) {
                return h.trim().replace(/"/g, '').replace(/^\ufeff/, '').toLowerCase();
            },
            complete: async (results) => {
                console.log("✅ CSV Lido. Linhas:", results.data.length);
                await this.salvarDados(results.data);
                
                if(btn) btn.innerHTML = '<i class="fas fa-file-upload"></i> Importar CSV';
                const input = document.getElementById('input-csv-assertividade');
                if(input) input.value = '';
            },
            error: (err) => {
                alert("Erro ao ler CSV: " + err.message);
                if(btn) btn.innerHTML = '<i class="fas fa-file-upload"></i> Importar CSV';
                if(statusEl) statusEl.innerHTML = "Erro na leitura";
            }
        });
    },

    salvarDados: async function(linhas) {
        const statusEl = document.getElementById('status-importacao-assert');
        if(statusEl) statusEl.innerHTML = `<span class="text-purple-600">Validando dados...</span>`;

        let validos = [];
        let ignorados = 0;
        
        // Variáveis para detectar o período do arquivo (Min/Max Data)
        let minDate = null;
        let maxDate = null;
        
        for (const row of linhas) {
            // 1. ID Assistente: Limpeza agressiva para garantir Inteiro
            let idRaw = row['id_assistente'] || row['id assistente'] || row['usuario_id'];
            let idAssistente = idRaw ? parseInt(idRaw.toString().replace(/\D/g, '')) : null;

            if (!idAssistente) {
                ignorados++;
                continue; 
            }

            // 2. Data Referência (end_time): Ponto Crítico para a Meta
            let dataRef = row['end_time']; 
            if (!dataRef) dataRef = row['data'] || row['date'] || row['created_at'];

            // Validação de Data
            if (!dataRef || isNaN(new Date(dataRef).getTime())) {
                ignorados++;
                continue;
            }

            // Atualiza intervalo de datas detectado
            const currentDt = new Date(dataRef);
            if (!minDate || currentDt < minDate) minDate = currentDt;
            if (!maxDate || currentDt > maxDate) maxDate = currentDt;

            // 3. Porcentagem (% Assert)
            let pctRaw = row['% assert'] || row['assert'] || row['% assertividade'] || row['assertividade'] || '0';
            let pct = parseFloat(pctRaw.toString().replace('%','').replace(',','.').trim());
            
            // Tratamento para coluna TEXT no banco (envia string formatada)
            let pctFinal = isNaN(pct) ? null : pct.toFixed(2); 

            // 4. Data Auditoria (Opcional)
            let dataAudit = row['data da auditoria'] || row['data auditoria'];
            if (dataAudit && dataAudit.includes('/')) {
                const parts = dataAudit.split('/');
                if(parts.length === 3) dataAudit = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }

            validos.push({
                usuario_id: idAssistente,
                nome_assistente: row['assistente'] || '',
                nome_auditora_raw: row['auditora'] || '',
                nome_documento: row['doc_name'] || row['documento'] || row['nome da ppc'] || '',
                status: row['status'] || '',
                observacao: row['apontamentos/obs'] || row['observação'] || row['obs'] || '',
                qtd_ok: parseInt(row['ok'] || 0),
                qtd_nok: parseInt(row['nok'] || 0),
                num_campos: parseInt(row['nº campos'] || row['num campos'] || 0),
                porcentagem: pctFinal,
                data_referencia: dataRef,
                data_auditoria: dataAudit,
                empresa_nome: row['empresa'] || '',
                empresa_id: parseInt(row['company_id'] || 0)
            });
        }

        if (validos.length === 0) {
            alert(`Nenhum dado válido. Verifique se o CSV tem 'id_assistente' e 'end_time'.`);
            if(statusEl) statusEl.innerHTML = "";
            return;
        }

        // --- PROTOCOLO NEXUS: Limpeza de Dados Antigos ---
        // Garante que não duplique dados se o usuário reimportar o mesmo mês
        if (minDate && maxDate) {
            const startStr = minDate.toISOString();
            const endStr = maxDate.toISOString();
            
            if(confirm(`📅 Período Detectado: \n${minDate.toLocaleDateString()} a ${maxDate.toLocaleDateString()}\n\nDeseja SUBSTITUIR os dados deste período? (Recomendado para evitar duplicidade)`)) {
                if(statusEl) statusEl.innerHTML = `<span class="text-rose-500">Limpando período...</span>`;
                
                const { error: deleteError } = await Sistema.supabase
                    .from('assertividade')
                    .delete()
                    .gte('data_referencia', startStr)
                    .lte('data_referencia', endStr);
                
                if (deleteError) {
                    console.error("Erro ao limpar dados antigos:", deleteError);
                    alert("Aviso: Não foi possível limpar dados antigos. A importação continuará, mas pode haver duplicatas.");
                }
            }
        }

        // --- Inserção em Lote (Batch Insert) ---
        const BATCH_SIZE = 1000; // Aumentado para performance
        let erros = 0;
        let msgErroCritico = "";

        for (let i = 0; i < validos.length; i += BATCH_SIZE) {
            const lote = validos.slice(i, i + BATCH_SIZE);
            
            if(statusEl) {
                const progresso = Math.min(100, Math.round(((i + lote.length) / validos.length) * 100));
                statusEl.innerHTML = `<span class="text-orange-600 font-bold"><i class="fas fa-circle-notch fa-spin"></i> Enviando... ${progresso}%</span>`;
            }

            const { error } = await Sistema.supabase.from('assertividade').insert(lote);
            
            if (error) {
                console.error("❌ Erro insert Supabase:", error);
                if (error.code === 'PGRST204') {
                    // Erro de coluna faltante (Schema Cache)
                    msgErroCritico = `ERRO DE SCHEMA: O banco recusou a coluna '${error.message}'.\nSolução: Execute 'NOTIFY pgrst, "reload config"' no SQL Editor.`;
                    break; 
                }
                erros++;
            }
        }

        if (msgErroCritico) {
            alert(msgErroCritico);
            if(statusEl) statusEl.innerHTML = "Erro Crítico de Banco";
        } else if (erros > 0) {
            alert(`Importação concluída com ${erros} erros de lote. Verifique o console.`);
            if(statusEl) statusEl.innerHTML = "Concluído com alertas";
        } else {
            alert(`✅ Sucesso! ${validos.length} registros processados e atualizados.`);
            if(statusEl) statusEl.innerHTML = '<span class="text-emerald-600 font-bold">Sucesso!</span>';
            
            // Atualiza a tabela se estiver visível
            if(Gestao.Assertividade && Gestao.Assertividade.buscarDados) Gestao.Assertividade.buscarDados();
        }
        
        setTimeout(() => { if(statusEl) statusEl.innerHTML = ""; }, 5000);
    }
};

// Inicialização segura para garantir carregamento do DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Gestao.Importacao.Assertividade.init());
} else {
    Gestao.Importacao.Assertividade.init();
}