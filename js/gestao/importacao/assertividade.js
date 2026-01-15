window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

Gestao.Importacao.Assertividade = {
    init: function() {
        const input = document.getElementById('input-csv-assertividade');
        if (input) {
            // Remove listeners antigos clonando o elemento
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
            }
        });
    },

    salvarDados: async function(linhas) {
        const statusEl = document.getElementById('status-importacao-assert');
        if(statusEl) statusEl.innerHTML = `<span class="text-purple-600">Analisando ${linhas.length} linhas...</span>`;

        let validos = [];
        let ignorados = 0;
        
        for (const row of linhas) {
            // 1. ID Assistente
            let idAssistente = row['id_assistente'] || row['id assistente'] || row['usuario_id'];
            if (idAssistente) idAssistente = parseInt(idAssistente.toString().replace(/\D/g, ''));

            if (!idAssistente) {
                ignorados++;
                continue; 
            }

            // 2. Data Referência (end_time)
            let dataRef = row['end_time']; 
            if (!dataRef) dataRef = row['data'] || row['date'] || row['created_at'];

            if (!dataRef) {
                ignorados++;
                continue;
            }

            // 3. Porcentagem
            let pctRaw = row['% assert'] || row['assert'] || row['% assertividade'] || row['assertividade'] || '0';
            let pct = parseFloat(pctRaw.toString().replace('%','').replace(',','.').trim());
            if (isNaN(pct)) pct = null;

            // 4. Data Auditoria
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
                porcentagem: pct, 
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

        // Loteamento
        const BATCH_SIZE = 1000;
        let erros = 0;

        for (let i = 0; i < validos.length; i += BATCH_SIZE) {
            const lote = validos.slice(i, i + BATCH_SIZE);
            const { error } = await Sistema.supabase.from('assertividade').insert(lote);
            
            if (error) {
                console.error("❌ Erro insert Supabase:", error);
                // ALERTA INTELIGENTE: Mostra exatamente o erro que o banco retornou
                if (error.code === 'PGRST204') {
                    alert(`ERRO DE BANCO DE DADOS:\n\n${error.message}\n\nProvavelmente falta criar uma coluna no Supabase. Chame o suporte.`);
                    if(statusEl) statusEl.innerHTML = "";
                    return; // Para a importação imediatamente
                }
                erros++;
            }
            
            if(statusEl) {
                const progresso = Math.min(100, Math.round(((i + lote.length) / validos.length) * 100));
                statusEl.innerHTML = `<span class="text-orange-600 font-bold"><i class="fas fa-circle-notch fa-spin"></i> Enviando... ${progresso}%</span>`;
            }
        }

        if (erros > 0) {
            alert(`Importação finalizada com ${erros} erros de lote. Verifique o console.`);
        } else {
            alert(`✅ Sucesso! ${validos.length} registros importados.`);
            if(Gestao.Assertividade && Gestao.Assertividade.buscarDados) Gestao.Assertividade.buscarDados();
        }
        
        setTimeout(() => { if(statusEl) statusEl.innerHTML = ""; }, 3000);
    }
};

// Inicialização segura
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Gestao.Importacao.Assertividade.init());
} else {
    Gestao.Importacao.Assertividade.init();
}