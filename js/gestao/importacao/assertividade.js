// js/gestao/importacao/assertividade.js

/**
 * Processa o arquivo CSV de Assertividade
 * @param {File} file - O arquivo CSV selecionado
 */
async function processarArquivo(file) {
    const statusDiv = document.getElementById('status-importacao');
    
    // 1. Extração e Validação da Data de Referência
    let dataReferencia = extrairDataDoNomeArquivo(file.name);

    if (!dataReferencia) {
        // Fallback de UX: Pergunta a data se o nome do arquivo estiver fora do padrão
        const inputData = prompt(`O arquivo "${file.name}" não segue o padrão DDMMAAAA.csv.\nPor favor, informe a data de referência (DD/MM/AAAA):`);
        if (inputData) {
            dataReferencia = converterStringParaData(inputData);
        }
    }

    if (!dataReferencia || isNaN(dataReferencia.getTime())) {
        atualizarStatus(statusDiv, '❌ Erro: Data inválida. Renomeie o arquivo para DDMMAAAA.csv (ex: 01122025.csv).', 'text-red-500');
        return;
    }

    atualizarStatus(statusDiv, '⏳ Lendo arquivo CSV...', 'text-blue-500');

    // 2. Leitura do CSV com PapaParse
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        encoding: "UTF-8",
        complete: async function(results) {
            try {
                if (results.data.length === 0) {
                    throw new Error("O arquivo CSV está vazio.");
                }

                atualizarStatus(statusDiv, `⏳ Processando ${results.data.length} linhas...`, 'text-blue-500');
                await salvarDados(results.data, dataReferencia, statusDiv);

            } catch (error) {
                console.error("Erro no processamento:", error);
                atualizarStatus(statusDiv, `❌ Erro fatal: ${error.message}`, 'text-red-600');
            }
        },
        error: function(error) {
            atualizarStatus(statusDiv, `❌ Erro ao ler CSV: ${error.message}`, 'text-red-600');
        }
    });
}

/**
 * Salva os dados no Supabase em lotes
 */
async function salvarDados(dados, dataRef, statusDiv) {
    const usuario = Sistema.usuario;
    if (!usuario) {
        throw new Error("Usuário não autenticado.");
    }

    // Mapeamento De/Para (CSV -> Banco)
    // Removemos chaves vazias e tratamos tipos numéricos
    const payload = dados.map(row => {
        // Ignora linhas totalmente vazias ou cabeçalhos repetidos no meio
        if (!row['ID PPC'] || row['ID PPC'] === 'ID PPC') return null;

        return {
            usuario_id: usuario.id,
            data_referencia: dataRef.toISOString().split('T')[0], // YYYY-MM-DD
            
            // Mapeamento direto das colunas do CSV do usuário
            nome_assistente: row['Assistente'] || null,
            nome_auditora_raw: row['Auditora'] || null,
            nome_documento: row['doc_name'] || null,
            status: row['STATUS'] || null,
            observacao: row['Apontamentos/obs'] || null,
            empresa_nome: row['Empresa'] || null,
            empresa_id: row['Company_id'] || null,
            
            // Tratamento de Data da Auditoria (DD/MM/YYYY -> YYYY-MM-DD)
            data_auditoria: converterStringParaData(row['Data da Auditoria '])?.toISOString().split('T')[0] || null,

            // Sanitização Numérica (converte "100,00%", "#VALUE!", etc)
            qtd_ok: limparNumero(row['Ok']),
            qtd_nok: limparNumero(row['Nok']),
            num_campos: limparNumero(row['nº Campos']),
            porcentagem: limparPorcentagem(row['% Assert'])
        };
    }).filter(item => item !== null); // Remove nulos

    if (payload.length === 0) {
        throw new Error("Nenhum dado válido encontrado para importação.");
    }

    try {
        // 1. Limpeza Prévia (Atomicidade por data)
        const dataStr = dataRef.toISOString().split('T')[0];
        const { error: deleteError } = await Sistema.supabase
            .from('assertividade')
            .delete()
            .eq('usuario_id', usuario.id)
            .eq('data_referencia', dataStr);

        if (deleteError) throw deleteError;

        // 2. Inserção em Lotes (Batch Insert) para performance
        const BATCH_SIZE = 1000;
        for (let i = 0; i < payload.length; i += BATCH_SIZE) {
            const lote = payload.slice(i, i + BATCH_SIZE);
            const { error: insertError } = await Sistema.supabase
                .from('assertividade')
                .insert(lote);

            if (insertError) {
                // Se erro for de coluna inexistente, lança erro específico
                if (insertError.code === 'PGRST204') {
                    throw new Error("Erro de Schema: Colunas do banco não correspondem ao script. Execute o SQL de correção.");
                }
                throw insertError;
            }
            
            // Feedback de progresso visual
            const percent = Math.min(100, Math.round(((i + BATCH_SIZE) / payload.length) * 100));
            atualizarStatus(statusDiv, `⏳ Enviando dados: ${percent}%`, 'text-blue-500');
        }

        // 3. Finalização
        atualizarStatus(statusDiv, `✅ Sucesso! ${payload.length} registros importados.`, 'text-green-600');
        
        // Atualiza a interface globalmente se a função existir
        if (typeof atualizarTodasAbas === 'function') {
            atualizarTodasAbas();
        }

    } catch (err) {
        console.error("Erro Supabase:", err);
        throw new Error(`Falha no banco de dados: ${err.message}`);
    }
}

// --- Helpers ---

function extrairDataDoNomeArquivo(nomeArquivo) {
    // Regex para pegar DDMMAAAA no início do arquivo
    const match = nomeArquivo.match(/^(\d{2})(\d{2})(\d{4})/);
    if (match) {
        const dia = parseInt(match[1]);
        const mes = parseInt(match[2]) - 1; // JS conta meses de 0 a 11
        const ano = parseInt(match[3]);
        return new Date(ano, mes, dia);
    }
    return null;
}

function converterStringParaData(dataStr) {
    if (!dataStr) return null;
    // Tenta formato DD/MM/YYYY
    const partes = dataStr.trim().split('/');
    if (partes.length === 3) {
        return new Date(partes[2], partes[1] - 1, partes[0]);
    }
    return null;
}

function limparNumero(valor) {
    if (!valor || valor === '#N/A' || valor === '#VALUE!') return 0;
    if (typeof valor === 'number') return valor;
    // Remove caracteres não numéricos exceto vírgula/ponto
    return parseInt(valor.replace(/\D/g, '')) || 0;
}

function limparPorcentagem(valor) {
    if (!valor || typeof valor !== 'string') return 0;
    // Ex: "100,00%" -> 100.00
    let limpo = valor.replace('%', '').replace(',', '.');
    return parseFloat(limpo) || 0;
}

function atualizarStatus(elemento, mensagem, classeCor) {
    if (elemento) {
        elemento.innerText = mensagem;
        elemento.className = `mt-4 text-sm font-medium ${classeCor}`;
    }
}

// Expor função para o HTML/Main
window.processarArquivoAssertividade = processarArquivo;