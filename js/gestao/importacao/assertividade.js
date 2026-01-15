window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

Gestao.Importacao.Assertividade = {
    init: function() {
        const input = document.getElementById('input-csv-assertividade');
        if (input) {
            input.addEventListener('change', (e) => this.processarArquivo(e.target.files[0]));
        }
    },

    processarArquivo: function(file) {
        if (!file) return;

        const btn = document.getElementById('btn-importar-assert');
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo...';

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8",
            complete: async (results) => {
                await this.salvarDados(results.data);
                if(btn) btn.innerHTML = '<i class="fas fa-file-upload"></i> Importar CSV';
                document.getElementById('input-csv-assertividade').value = '';
            }
        });
    },

    salvarDados: async function(linhas) {
        const statusEl = document.getElementById('status-importacao-assert');
        if(statusEl) statusEl.innerHTML = `<span class="text-blue-500">Processando ${linhas.length} linhas...</span>`;

        let validos = [];
        
        for (const row of linhas) {
            // 1. Mapeamento de IDs
            let idAssistente = row['id_assistente'] || row['ID Assistente'];
            if (!idAssistente) continue; // Pula se não tiver ID
            
            idAssistente = parseInt(idAssistente.toString().replace(/\D/g, ''));

            // 2. Extração da Data de Referência (END_TIME)
            // A coluna end_time vem como "2025-12-02T12:17:04.332Z"
            let dataRef = row['end_time']; 
            if (!dataRef) continue; // Sem data, sem registro

            // 3. Extração da Porcentagem (% Assert)
            let pctRaw = row['% Assert'] || row['% Assertividade'] || '0';
            let pct = parseFloat(pctRaw.toString().replace('%','').replace(',','.').trim());
            
            if (isNaN(pct)) pct = null;

            // 4. Outros Campos
            let dataAudit = row['Data da Auditoria '] || row['Data da Auditoria'];
            // Converte DD/MM/AAAA para AAAA-MM-DD se necessário
            if (dataAudit && dataAudit.includes('/')) {
                const parts = dataAudit.split('/');
                if(parts.length === 3) dataAudit = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }

            validos.push({
                usuario_id: idAssistente,
                nome_assistente: row['Assistente'],
                nome_auditora_raw: row['Auditora'],
                nome_documento: row['doc_name'] || row['Documento'],
                status: row['STATUS'] || row['Status'],
                observacao: row['Apontamentos/obs'] || row['Observação'],
                qtd_ok: parseInt(row['Ok'] || 0),
                qtd_nok: parseInt(row['Nok'] || 0),
                num_campos: parseInt(row['nº Campos'] || 0),
                porcentagem: pct, // Coluna N do Excel
                data_referencia: dataRef, // VITAL: Usa end_time como referência
                data_auditoria: dataAudit,
                empresa_nome: row['Empresa'],
                empresa_id: parseInt(row['Company_id'] || 0)
            });
        }

        if (validos.length === 0) {
            alert("Nenhum dado válido encontrado. Verifique se o CSV tem as colunas 'id_assistente', 'end_time' e '% Assert'.");
            if(statusEl) statusEl.innerHTML = "";
            return;
        }

        // Limpa dados antigos dessas datas (Opcional, mas recomendado para evitar duplicação)
        // Aqui faremos apenas o Insert para simplificar, o Supabase deve ter IDs únicos ou tratamos isso.
        // Melhor abordagem: Inserir em lotes.

        const BATCH_SIZE = 500;
        let erros = 0;

        for (let i = 0; i < validos.length; i += BATCH_SIZE) {
            const lote = validos.slice(i, i + BATCH_SIZE);
            const { error } = await Sistema.supabase.from('assertividade').insert(lote);
            if (error) {
                console.error("Erro insert:", error);
                erros++;
            }
            if(statusEl) statusEl.innerHTML = `Enviando... ${Math.round((i/validos.length)*100)}%`;
        }

        if (erros > 0) {
            alert(`Importação concluída com ${erros} lotes com erro. Verifique o console.`);
        } else {
            alert(`Sucesso! ${validos.length} registros de assertividade importados.`);
            // Atualiza a tela se estiver na gestão
            if(Gestao.Assertividade && Gestao.Assertividade.buscarDados) Gestao.Assertividade.buscarDados();
        }
        
        if(statusEl) statusEl.innerHTML = "";
    }
};

// Inicializa
document.addEventListener('DOMContentLoaded', () => {
    Gestao.Importacao.Assertividade.init();
});