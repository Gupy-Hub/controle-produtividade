window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    BATCH_SIZE: 500, // Reduzido para garantir estabilidade

    processarArquivo: function(input) {
        const file = input.files[0];
        if (!file) return;

        console.log(`📂 [Importacao] Iniciando V2 (Blindada): ${file.name}`);
        
        // 1. Extração da Data (DDMMAAAA)
        const dataReferencia = this.extrairDataDoNome(file.name);
        
        if (!dataReferencia) {
            alert("ERRO: O nome do arquivo deve conter a data no formato DDMMAAAA (ex: Assertividade_01122025.csv).");
            input.value = '';
            return;
        }

        const statusLabel = document.getElementById('status-importacao');
        if (statusLabel) statusLabel.innerText = "Lendo e limpando CSV...";

        // 2. Leitura com PapaParse
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: "ISO-8859-1", // Importante para acentos
            complete: async (results) => {
                try {
                    console.log(`📊 Linhas brutas encontradas: ${results.data.length}`);
                    await this.enviarLotesSeguros(results.data, dataReferencia);
                    
                    alert("✅ Importação concluída com sucesso!");
                    if (Gestao.Assertividade) Gestao.Assertividade.carregar();
                
                } catch (error) {
                    console.error("Erro fatal na importação:", error);
                    alert(`Falha na importação: ${error.message}`);
                } finally {
                    input.value = '';
                    if (statusLabel) statusLabel.innerText = "";
                }
            },
            error: (err) => {
                console.error("Erro PapaParse:", err);
                alert("Erro ao ler o arquivo CSV.");
            }
        });
    },

    extrairDataDoNome: function(filename) {
        // Tenta capturar padrão DDMMAAAA
        const match = filename.match(/(\d{2})(\d{2})(\d{4})/);
        if (match) {
            return `${match[3]}-${match[2]}-${match[1]}`; // Retorna YYYY-MM-DD
        }
        return null;
    },

    normalizarChaves: function(row) {
        // Converte chaves para minusculo e remove espaços (Ex: "ID PPC " -> "id_ppc")
        const novo = {};
        Object.keys(row).forEach(key => {
            const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_');
            novo[cleanKey] = row[key];
        });
        return novo;
    },

    mapearLinha: function(row, dataRef, userLogado) {
        const norm = this.normalizarChaves(row);
        
        // --- FILTRO CRÍTICO ---
        // Busca ID PPC em diversas variações de nome
        let idPpc = norm['id_ppc'] || norm['id'] || norm['idppc'] || norm['ppc_id'] || row['ID PPC'] || row['ID'];

        // Se o ID for vazio, nulo ou indefinido, REJEITA a linha imediatamente
        if (!idPpc || String(idPpc).trim() === '') {
            return null; 
        }
        // ----------------------

        // Tratamento de Status
        let statusRaw = (norm['status'] || '').toUpperCase();
        if (statusRaw.includes('VALID')) statusRaw = 'VALIDO';
        else if (statusRaw.includes('INVALID')) statusRaw = 'INVALIDO';
        else if (statusRaw.includes('OK')) statusRaw = 'OK';
        else if (statusRaw.includes('NOK')) statusRaw = 'NOK';
        
        // Tratamento Numérico
        const parseNum = (v) => {
            if (!v) return 0;
            return parseFloat(String(v).replace('%','').replace(',','.').trim()) || 0;
        };

        return {
            id_ppc: String(idPpc).trim(),
            data_referencia: dataRef,
            usuario_id: userLogado.id,
            
            empresa_nome: (norm['empresa'] || norm['nome_empresa'] || '').trim().substring(0, 255),
            assistente_nome: (norm['assistente'] || norm['nome_assistente'] || '').trim().substring(0, 255),
            auditora_nome: (norm['auditora'] || norm['auditor'] || userLogado.nome || '').trim().substring(0, 100),
            doc_name: (norm['doc_name'] || norm['documento'] || '').trim().substring(0, 255),
            observacao: (norm['observacao'] || norm['obs'] || norm['motivo'] || norm['apontamentos/obs'] || '').trim(),
            status: statusRaw || 'PENDENTE',
            
            company_id: (norm['company_id'] || '0').toString(),
            schema_id: (norm['schema_id'] || '0').toString(),
            data_auditoria: new Date().toISOString(),
            
            qtd_campos: parseNum(norm['qtd_campos'] || norm['nº_campos']),
            qtd_ok: parseNum(norm['qtd_ok'] || norm['ok']),
            qtd_nok: parseNum(norm['qtd_nok'] || norm['nok']),
            porcentagem_assertividade: (norm['porcentagem'] || norm['%_assert'] || '0')
        };
    },

    enviarLotesSeguros: async function(linhasBrutas, dataRef) {
        const user = Sistema.getUsuarioLogado();
        if (!user) throw new Error("Usuário não autenticado.");

        const statusLabel = document.getElementById('status-importacao');
        
        // 1. LIMPEZA DOS DADOS (Aqui acontece a mágica)
        console.log("🧹 Iniciando limpeza de dados...");
        const linhasTratadas = linhasBrutas
            .map(row => this.mapearLinha(row, dataRef, user))
            .filter(row => row !== null); // <--- REMOVE LINHAS COM ID NULO

        const descartados = linhasBrutas.length - linhasTratadas.length;
        console.log(`✅ Linhas Válidas: ${linhasTratadas.length}`);
        console.log(`🗑️ Linhas Descartadas (Lixo/Vazias): ${descartados}`);
        
        if (linhasTratadas.length === 0) {
            throw new Error("Nenhuma linha válida encontrada! Verifique se a coluna 'ID PPC' existe no arquivo.");
        }

        // 2. ENVIO EM LOTES
        const total = linhasTratadas.length;
        
        for (let i = 0; i < total; i += this.BATCH_SIZE) {
            const lote = linhasTratadas.slice(i, i + this.BATCH_SIZE);
            
            if (statusLabel) statusLabel.innerText = `Enviando ${Math.min(i + this.BATCH_SIZE, total)}/${total}...`;

            const { error } = await Sistema.supabase
                .from('assertividade')
                .upsert(lote, { 
                    onConflict: 'id_ppc, data_referencia',
                    ignoreDuplicates: false 
                });

            if (error) {
                console.warn(`⚠️ Erro parcial no lote ${i} (tentando continuar):`, error.message);
                // Não lança erro fatal para não abortar tudo por causa de 1 lote ruim
            }
        }
        console.log("🏁 Processamento finalizado.");
    }
};