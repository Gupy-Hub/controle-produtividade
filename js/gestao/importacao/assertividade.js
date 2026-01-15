Gestao.ImportacaoAssertividade = {
    init: function() {
        // ... código de inicialização do modal ...
    },

    processarCSV: async function(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            const rows = text.split('\n').slice(1); // Pula cabeçalho
            
            const listaParaSalvar = [];

            console.log("📂 Iniciando leitura do CSV...");

            rows.forEach(row => {
                const cols = row.split(','); // ou ';' dependendo do CSV
                if (cols.length < 5) return;

                // Mapeie as colunas conforme seu CSV (Ajuste os índices se necessário)
                // Exemplo baseado no seu snippet: 
                // Col 5: Assistente, Col 13: % Assert, Col 14: Data, Col 15: Auditora
                
                const assistenteNome = cols[5] ? cols[5].replace(/"/g, '').trim() : '';
                const pctRaw = cols[13] ? cols[13].replace(/"/g, '').trim() : ''; 
                const dataRaw = cols[14] ? cols[14].replace(/"/g, '').trim() : '';
                const auditoraNome = cols[15] ? cols[15].replace(/"/g, '').trim() : '';

                // --- LÓGICA CORRETA: IGNORA STATUS, OLHA APENAS A NOTA ---
                
                // 1. Limpa a porcentagem
                let valStr = pctRaw.replace('%', '').replace(',', '.').trim();
                let val = parseFloat(valStr);

                // 2. Só importa se for um número válido entre 0 e 100
                if (!isNaN(val) && val >= 0 && val <= 100) {
                    
                    // Formata data (DD/MM/YYYY -> YYYY-MM-DD)
                    let dataFmt = null;
                    if (dataRaw.includes('/')) {
                        const [d, m, y] = dataRaw.split('/');
                        dataFmt = `${y}-${m}-${d}`;
                    } else {
                        dataFmt = new Date().toISOString().split('T')[0]; // Fallback
                    }

                    listaParaSalvar.push({
                        assistente: assistenteNome,
                        porcentagem: pctRaw, // Salva original ou formatado
                        data_auditoria: dataFmt,
                        auditora: auditoraNome,
                        // Outros campos opcionais...
                        status: 'IMPORTADO' // Status interno apenas para controle
                    });
                }
            });

            console.log(`✅ ${listaParaSalvar.length} linhas válidas (0-100%) encontradas.`);
            
            if (listaParaSalvar.length > 0) {
                await this.enviarParaSupabase(listaParaSalvar);
            } else {
                alert("Nenhuma linha com porcentagem válida encontrada.");
            }
        };
        reader.readAsText(file);
    },

    enviarParaSupabase: async function(dados) {
        // Lógica de batch insert no Supabase
        // ... (Seu código de insert existente) ...
        // Certifique-se de NÃO filtrar nada aqui também.
    }
};