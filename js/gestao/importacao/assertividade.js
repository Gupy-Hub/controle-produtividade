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
            // CRÍTICO: Limpa o BOM (\ufeff) e espaços/aspas dos cabeçalhos
            transformHeader: function(h) {
                return h.trim().replace(/"/g, '').replace(/^\ufeff/, '').toLowerCase();
            },
            complete: async (results) => {
                console.log("Linhas lidas do CSV:", results.data.length);
                if (results.data.length > 0) {
                    console.log("Exemplo de linha bruta:", results.data[0]);
                }
                await this.salvarDados(results.data);
                
                if(btn) btn.innerHTML = '<i class="fas fa-file-upload"></i> Importar CSV';
                const input = document.getElementById('input-csv-assertividade');
                if(input) input.value = '';
            }
        });
    },

    salvarDados: async function(linhas) {
        const statusEl = document.getElementById('status-importacao-assert');
        if(statusEl) statusEl.innerHTML = `<span class="text-blue-500">Processando ${linhas.length} linhas...</span>`;

        let validos = [];
        let ignorados = 0;
        
        for (const row of linhas) {
            // 1. Busca ID do Assistente (Tenta variações comuns)
            // O transformHeader converte tudo para minúsculo, então buscamos keys minúsculas
            let idAssistente = row['id_assistente'] || row['id assistente'] || row['usuario_id'];
            
            // Tenta limpar caracteres não numéricos se achou algo
            if (idAssistente) {
                idAssistente = parseInt(idAssistente.toString().replace(/\D/g, ''));
            }

            if (!idAssistente) {
                ignorados++;
                continue; 
            }

            // 2. Extração da Data de Referência (end_time)
            // Agora em minúsculo devido ao transformHeader
            let dataRef = row['end_time']; 
            
            if (!dataRef) {
                // Fallback: Tenta outras colunas de data se end_time falhar
                dataRef = row['data'] || row['date'] || row['created_at'];
            }

            if (!dataRef) {
                console.warn("Linha sem data (end_time) ignorada:", row);
                ignorados++;
                continue;
            }

            // 3. Extração da Porcentagem (% Assert)
            // O transformHeader transformou "% Assert" em "% assert" ou "assert" dependendo da limpeza
            // Vamos tentar variações
            let pctRaw = row['% assert'] || row['assert'] || row['% assertividade'] || row['assertividade'] || '0';
            
            // Limpeza do valor (Ex: "98,5%" -> 98.5)
            let pct = parseFloat(pctRaw.toString().replace('%','').replace(',','.').trim());
            
            if (isNaN(pct)) pct = null;

            // 4. Outros Campos
            let dataAudit = row['data da auditoria'] || row['data auditoria'];
            // Tratamento data auditoria (PT-BR para ISO)
            if (dataAudit && dataAudit.includes('/')) {
                const parts = dataAudit.split('/');
                if(parts.length === 3) dataAudit = `${parts[2]}-${parts[1]}-${parts[0]}`; // AAAA-MM-DD
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
                porcentagem: pct, // Coluna N do Excel
                data_referencia: dataRef, // VITAL: Usa end_time como referência
                data_auditoria: dataAudit,
                empresa_nome: row['empresa'] || '',
                empresa_id: parseInt(row['company_id'] || 0)
            });
        }

        if (validos.length === 0) {
            alert(`Nenhum dado válido encontrado em ${linhas.length} linhas.\nVerifique se as colunas 'id_assistente', 'end_time' e '% Assert' existem.`);
            if(statusEl) statusEl.innerHTML = "";
            return;
        }

        console.log(`Dados prontos para envio: ${validos.length} registros. Ignorados: ${ignorados}`);
        console.log("Exemplo registro processado:", validos[0]);

        // Envio em Lotes
        const BATCH_SIZE = 500;
        let erros = 0;

        for (let i = 0; i < validos.length; i += BATCH_SIZE) {
            const lote = validos.slice(i, i + BATCH_SIZE);
            const { error } = await Sistema.supabase.from('assertividade').insert(lote);
            if (error) {
                console.error("Erro insert Supabase:", error);
                erros++;
            }
            if(statusEl) statusEl.innerHTML = `Enviando... ${Math.round((i/validos.length)*100)}%`;
        }

        if (erros > 0) {
            alert(`Importação concluída com erros em ${erros} lotes. Verifique o console (F12).`);
        } else {
            alert(`Sucesso! ${validos.length} registros importados corretamente.\n(Datas baseadas na coluna 'end_time')`);
            
            // Recarrega lista se estiver na tela de gestão
            if(Gestao.Assertividade && Gestao.Assertividade.buscarDados) {
                Gestao.Assertividade.buscarDados();
            }
        }
        
        if(statusEl) statusEl.innerHTML = "";
    }
};

// Auto-inicialização
document.addEventListener('DOMContentLoaded', () => {
    Gestao.Importacao.Assertividade.init();
});