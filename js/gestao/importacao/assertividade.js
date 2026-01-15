window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

Gestao.Importacao.Assertividade = {
    init: function() {
        // Garante que o input existe e remove listeners antigos
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
        
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo...';
        if(statusEl) statusEl.innerHTML = '<span class="text-blue-500">Lendo arquivo...</span>';

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8",
            // Limpa cabeçalhos (remove BOM \ufeff e aspas, converte para minúsculo)
            transformHeader: function(h) {
                return h.trim().replace(/"/g, '').replace(/^\ufeff/, '').toLowerCase();
            },
            complete: async (results) => {
                console.log("✅ CSV Lido. Linhas:", results.data.length);
                if(results.data.length > 0) console.log("Exemplo de cabeçalhos processados:", Object.keys(results.data[0]));
                
                await this.salvarDados(results.data);
                
                if(btn) btn.innerHTML = '<i class="fas fa-file-upload"></i> Importar CSV';
                const input = document.getElementById('input-csv-assertividade');
                if(input) input.value = '';
            },
            error: (err) => {
                alert("Erro ao ler CSV: " + err.message);
                if(btn) btn.innerHTML = '<i class="fas fa-file-upload"></i> Importar CSV';
            }
        });
    },

    salvarDados: async function(linhas) {
        const statusEl = document.getElementById('status-importacao-assert');
        if(statusEl) statusEl.innerHTML = `<span class="text-purple-600">Analisando ${linhas.length} linhas...</span>`;

        let validos = [];
        let ignorados = 0;
        
        for (const row of linhas) {
            // 1. ID Assistente (coluna 'id_assistente')
            let idAssistente = row['id_assistente'] || row['id assistente'];
            if (idAssistente) idAssistente = parseInt(idAssistente.toString().replace(/\D/g, ''));

            if (!idAssistente) {
                ignorados++;
                continue; 
            }

            // 2. Data Referência (VITAL: coluna 'end_time')
            let dataRef = row['end_time']; 
            if (!dataRef) {
                // Tenta fallback se end_time falhar
                dataRef = row['data'] || row['date'];
            }

            if (!dataRef) {
                ignorados++;
                continue;
            }

            // 3. Porcentagem (coluna '% assert' ou '% assertividade')
            let pctRaw = row['% assert'] || row['% assertividade'] || row['assertividade'] || '0';
            let pct = parseFloat(pctRaw.toString().replace('%','').replace(',','.').trim());
            // Envia como string formatada para compatibilidade com coluna text do banco
            let pctFinal = isNaN(pct) ? null : pct.toFixed(2); 

            // 4. Data Auditoria (coluna 'data da auditoria')
            let dataAudit = row['data da auditoria'] || row['data auditoria'];
            if (dataAudit && dataAudit.includes('/')) {
                const parts = dataAudit.split('/');
                if(parts.length === 3) dataAudit = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }

            // 5. Mapeamento Completo
            validos.push({
                usuario_id: idAssistente,
                nome_assistente: row['assistente'] || '', // Coluna 'assistente'
                nome_auditora_raw: row['auditora'] || '', // Coluna 'auditora'
                nome_documento: row['doc_name'] || row['documento'] || '', // Coluna 'doc_name'
                status: row['status'] || '', // Coluna 'status'
                observacao: row['apontamentos/obs'] || row['observação'] || '', // Coluna 'apontamentos/obs'
                qtd_ok: parseInt(row['ok'] || 0), // Coluna 'ok'
                qtd_nok: parseInt(row['nok'] || 0), // Coluna 'nok'
                num_campos: parseInt(row['nº campos'] || row['num campos'] || 0), // Coluna 'nº campos'
                porcentagem: pctFinal, // Coluna '% assert'
                data_referencia: dataRef, // Coluna 'end_time' -> Banco 'data_referencia'
                data_auditoria: dataAudit, // Coluna 'data da auditoria' -> Banco 'data_auditoria'
                empresa_nome: row['empresa'] || '', // Coluna 'empresa'
                empresa_id: parseInt(row['company_id'] || 0) // Coluna 'company_id'
            });
        }

        if (validos.length === 0) {
            alert(`Nenhum dado válido. Verifique se o CSV tem 'id_assistente' e 'end_time'.`);
            if(statusEl) statusEl.innerHTML = "";
            return;
        }

        // Loteamento
        const BATCH_SIZE = 500;
        let erros = 0;
        let msgErro = "";

        for (let i = 0; i < validos.length; i += BATCH_SIZE) {
            const lote = validos.slice(i, i + BATCH_SIZE);
            const { error } = await Sistema.supabase.from('assertividade').insert(lote);
            
            if (error) {
                console.error("❌ Erro insert Supabase:", error);
                if (error.code === 'PGRST204') {
                    msgErro = `ERRO DE SCHEMA: O banco não tem a coluna '${error.message}'. Execute o SQL enviado.`;
                    break;
                }
                erros++;
            }
            
            if(statusEl) {
                const progresso = Math.min(100, Math.round(((i + lote.length) / validos.length) * 100));
                statusEl.innerHTML = `<span class="text-orange-600 font-bold"><i class="fas fa-circle-notch fa-spin"></i> Enviando... ${progresso}%</span>`;
            }
        }

        if (msgErro) {
            alert(msgErro);
            if(statusEl) statusEl.innerHTML = "Erro Crítico";
        } else if (erros > 0) {
            alert(`Importação com ${erros} falhas. Verifique o console.`);
        } else {
            alert(`✅ Sucesso! ${validos.length} registros importados.`);
            if(Gestao.Assertividade && Gestao.Assertividade.buscarDados) Gestao.Assertividade.buscarDados();
        }
        
        setTimeout(() => { if(statusEl) statusEl.innerHTML = ""; }, 4000);
    }
};

// Inicialização segura
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Gestao.Importacao.Assertividade.init());
} else {
    Gestao.Importacao.Assertividade.init();
}