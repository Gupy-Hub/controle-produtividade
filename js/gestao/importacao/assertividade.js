window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    
    processarArquivo: function(input) {
        const arquivo = input.files[0];
        if (!arquivo) return;

        const statusEl = document.getElementById('status-importacao');
        statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Lendo e analisando colunas...</span>`;

        Papa.parse(arquivo, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8",
            // IMPORTANTE: Essa função limpa espaços em branco dos nomes das colunas (ex: "Data " vira "Data")
            transformHeader: function(header) {
                return header.trim();
            },
            complete: async (results) => {
                console.log("Colunas detectadas:", results.meta.fields); // Para debug no console
                
                if (results.data.length === 0) {
                    alert("O arquivo parece estar vazio ou não foi lido corretamente.");
                    statusEl.innerText = "";
                    return;
                }
                
                await this.enviarParaBanco(results.data);
                input.value = ""; 
            },
            error: (err) => {
                console.error("Erro CSV:", err);
                alert("Erro ao ler CSV: " + err.message);
                statusEl.innerText = "Erro na leitura.";
            }
        });
    },

    enviarParaBanco: async function(linhas) {
        const statusEl = document.getElementById('status-importacao');
        let sucesso = 0;
        let erros = 0;
        const TAMANHO_LOTE = 50;

        // Mapeamento Inteligente
        // Procura variações comuns de nomes de colunas
        const dadosFormatados = linhas.map(linha => {
            // Tenta encontrar a coluna de data em várias versões possíveis
            const valData = linha['Data da Auditoria'] || linha['Data'] || linha['data_auditoria'];
            
            // Se não tiver data, pulamos esta linha (regra de negócio: sem data = lixo)
            if (!valData) return null;

            // Tratamento de Data (DD/MM/YYYY -> YYYY-MM-DD)
            let dataFormatada = null;
            if (valData.includes('/')) {
                const partes = valData.split('/');
                if (partes.length === 3) dataFormatada = `${partes[2]}-${partes[1]}-${partes[0]}`;
            } else if (valData.includes('-')) {
                dataFormatada = valData; // Já está em formato ISO ou YYYY-MM-DD
            }

            if (!dataFormatada) return null;

            // Tratamento de Números (Converte texto "10" para número 10)
            const campos = parseInt(linha['nº Campos']) || 0;
            const ok = parseInt(linha['Ok']) || 0;
            const nok = parseInt(linha['Nok']) || 0;

            // Retorna objeto formatado para o Supabase
            return {
                data_auditoria: dataFormatada,
                company_id: linha['Company_id'] || null,
                empresa: linha['Empresa'] || linha['Nome da PPC'] || 'Desconhecida',
                assistente: linha['Assistente'] || linha['id_assistente'],
                doc_name: linha['doc_name'] || linha['DOCUMENTO'] || linha['nome_documento'],
                status: linha['STATUS'] || 'PENDENTE',
                obs: linha['Apontamentos/obs'] || linha['obs'] || '',
                campos: campos,
                ok: ok,
                nok: nok,
                porcentagem: linha['% Assert'] || '0%',
                auditora: linha['Auditora'] || 'Sistema'
            };
        }).filter(item => item !== null); // Remove os nulos (linhas inválidas)

        // Validação de Segurança antes de enviar
        if (dadosFormatados.length === 0) {
            alert("Nenhuma linha válida encontrada!\nVerifique se a coluna 'Data da Auditoria' existe no CSV.");
            statusEl.innerText = "Falha: Colunas não identificadas.";
            return;
        }

        const total = dadosFormatados.length;
        statusEl.innerHTML = `<span class="text-orange-500">Importando ${total} registros...</span>`;

        // Loop de Envio em Lotes
        for (let i = 0; i < total; i += TAMANHO_LOTE) {
            const lote = dadosFormatados.slice(i, i + TAMANHO_LOTE);
            statusEl.innerText = `Processando... (${i + lote.length}/${total})`;
            
            const { error } = await Sistema.supabase
                .from('assertividade')
                .insert(lote);

            if (error) {
                console.error("Erro no lote:", error);
                erros += lote.length;
            } else {
                sucesso += lote.length;
            }
        }

        // Relatório Final
        if (erros > 0) {
            statusEl.innerHTML = `<span class="text-red-600 font-bold"><i class="fas fa-exclamation-triangle"></i> Sucesso: ${sucesso} | Erros: ${erros}</span>`;
        } else {
            statusEl.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fas fa-check"></i> Concluído: ${sucesso} registros.</span>`;
            if(Gestao && Gestao.Assertividade) Gestao.Assertividade.carregar();
            alert(`Sucesso! ${sucesso} registros importados.`);
        }
    }
};