window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    
    processarArquivo: function(input) {
        const arquivo = input.files[0];
        if (!arquivo) return;

        const statusEl = document.getElementById('status-importacao');
        statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Analisando arquivo...</span>`;

        Papa.parse(arquivo, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8",
            transformHeader: function(header) {
                // Remove caracteres estranhos e espaços dos nomes das colunas
                return header.trim().replace(/"/g, '');
            },
            complete: async (results) => {
                if (results.data.length === 0) {
                    alert("Arquivo vazio.");
                    statusEl.innerText = "";
                    return;
                }
                await this.enviarParaBanco(results.data);
                input.value = ""; 
            },
            error: (err) => {
                console.error("Erro CSV:", err);
                alert("Erro leitura: " + err.message);
                statusEl.innerText = "Erro.";
            }
        });
    },

    enviarParaBanco: async function(linhas) {
        const statusEl = document.getElementById('status-importacao');
        let sucesso = 0;
        let ignorados = 0;
        let erros = 0;
        const TAMANHO_LOTE = 200; // Lote maior para performance

        // --- FILTRAGEM E PADRONIZAÇÃO ---
        const dadosFormatados = linhas.map(linha => {
            
            // 1. PADRONIZAÇÃO DA DATA (Golden Rule)
            // Prioridade: Data da Auditoria (Manual) > end_time (Sistema)
            let valData = linha['Data da Auditoria'] || linha['Data'] || linha['data_auditoria'];
            let origemData = 'AUDITORIA';

            if (!valData || valData.trim() === '') {
                valData = linha['end_time'];
                origemData = 'SISTEMA';
            }
            
            // Se não tem data nenhuma, é lixo
            if (!valData) return null;

            // Tratamento de Formatos (ISO vs BR)
            let dataFormatada = null;
            if (valData.includes('T')) dataFormatada = valData.split('T')[0];
            else if (valData.includes('/')) {
                const partes = valData.split('/'); // DD/MM/YYYY
                if (partes.length === 3) dataFormatada = `${partes[2]}-${partes[1]}-${partes[0]}`;
            } 
            else if (valData.includes('-')) dataFormatada = valData;

            if (!dataFormatada) return null;


            // 2. PADRONIZAÇÃO DA EMPRESA (Obrigatoriedade do ID)
            const idEmpresa = linha['Company_id'] || linha['company_id'];
            
            // REGRA CRÍTICA: Sem ID de empresa, ignoramos a linha.
            // Isso evita criar "empresas fantasmas" ou registros órfãos.
            if (!idEmpresa || idEmpresa.toString().trim() === '' || idEmpresa === '0') {
                return null;
            }

            // Tenta resgatar o nome de várias colunas possíveis
            let nomeEmpresa = linha['Empresa'] || 
                              linha['empresa'] || 
                              linha['Nome da PPC'] || 
                              linha[' Nome da PPC'] || 
                              '';

            // Se o nome estiver vazio, usa o ID como identificador provisório
            if (!nomeEmpresa || nomeEmpresa.trim() === '') {
                nomeEmpresa = `ID ${idEmpresa}`;
            }

            // 3. PADRONIZAÇÃO DE AUDITORA
            let auditora = linha['Auditora'];
            // Se auditora vazia, mas tem end_time, assume 'Sistema'
            if ((!auditora || auditora.trim() === '') && origemData === 'SISTEMA') {
                auditora = 'Sistema Automático';
            } else if (!auditora) {
                auditora = 'Não Identificado';
            }

            // Retorno do Objeto Limpo
            return {
                data_auditoria: dataFormatada,
                company_id: idEmpresa.toString().trim(), // ID sempre como String
                empresa: nomeEmpresa.trim(),
                assistente: linha['Assistente'] || linha['id_assistente'] || 'Desconhecido',
                doc_name: linha['doc_name'] || linha['DOCUMENTO'] || linha['nome_documento'] || '-',
                status: linha['STATUS'] || 'PROCESSADO', // Se status vazio, mas tem dados, assumimos processado
                obs: (linha['Apontamentos/obs'] || linha['obs'] || '') + (origemData === 'SISTEMA' ? ' [Auto]' : ''),
                campos: parseInt(linha['nº Campos']) || 0,
                ok: parseInt(linha['Ok']) || 0,
                nok: parseInt(linha['Nok']) || 0,
                porcentagem: linha['% Assert'] || '0%',
                auditora: auditora
            };
        }).filter(item => item !== null); // Remove os nulos (linhas inválidas/sem ID)

        const total = dadosFormatados.length;
        ignorados = linhas.length - total; // Contabiliza quantos foram descartados

        if (total === 0) {
            alert("Nenhum registro válido encontrado (Verifique se a coluna Company_id existe).");
            statusEl.innerText = "Falha: Dados insuficientes.";
            return;
        }

        statusEl.innerHTML = `<span class="text-orange-500 font-bold">Importando ${total.toLocaleString('pt-BR')} registros... (${ignorados} ignorados por falta de ID)</span>`;

        // Envio em Lotes
        for (let i = 0; i < total; i += TAMANHO_LOTE) {
            const lote = dadosFormatados.slice(i, i + TAMANHO_LOTE);
            
            // Feedback visual de progresso
            if (i % (TAMANHO_LOTE * 5) === 0) {
                const progresso = Math.round((i/total)*100);
                statusEl.innerText = `Processando... ${progresso}%`;
            }
            
            const { error } = await Sistema.supabase.from('assertividade').insert(lote);

            if (error) {
                console.error("Erro lote:", error);
                erros += lote.length;
            } else {
                sucesso += lote.length;
            }
        }

        // Relatório Final
        let msgFinal = `Sucesso: ${sucesso.toLocaleString('pt-BR')}`;
        if (erros > 0) msgFinal += ` | Falhas: ${erros}`;
        if (ignorados > 0) msgFinal += ` | Ignorados (Sem ID): ${ignorados}`;

        if (erros > 0) {
            statusEl.innerHTML = `<span class="text-red-600 font-bold">${msgFinal}</span>`;
        } else {
            statusEl.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fas fa-check"></i> Importação Concluída!</span>`;
            if(Gestao && Gestao.Assertividade) Gestao.Assertividade.carregar();
            alert(`Processo Finalizado!\n\n${msgFinal}\n\nNota: Linhas sem 'Company_id' foram ignoradas para evitar empresas 'sem dados'.`);
        }
    }
};