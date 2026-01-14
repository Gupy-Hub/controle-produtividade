window.Produtividade = window.Produtividade || {};
window.Produtividade.Importacao = window.Produtividade.Importacao || {};

// === IMPORTADOR DE PRODUÇÃO: MULTI-ARQUIVO (DATA VIA NOME) ===
Produtividade.Importacao.Validacao = {
    dadosParaSalvar: [], // Array acumulado de todos os arquivos
    datasEncontradas: new Set(), // Set para controlar quais datas estamos manipulando
    
    init: function() {
        console.log("📥 Importação de Produção: Iniciada (Modo Lote/Data no Nome)");
    },

    processar: async function(input) {
        const files = Array.from(input.files);
        if (files.length === 0) return;

        const statusEl = document.getElementById('status-importacao-prod');
        this.dadosParaSalvar = [];
        this.datasEncontradas = new Set();
        let arquivosLidos = 0;
        let erros = [];

        // Limpa input para permitir re-seleção futura
        const resetInput = () => { input.value = ''; };

        if(statusEl) statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Lendo ${files.length} arquivos...</span>`;

        // Processamento em Série (para não travar o browser se forem muitos)
        for (const file of files) {
            // 1. Extração da Data
            const dataArquivo = this.extrairDataDoNome(file.name);
            
            if (!dataArquivo) {
                erros.push(`Arquivo "${file.name}": Nome inválido (use DDMMAAAA.csv)`);
                continue;
            }

            try {
                // 2. Leitura e Parse (Promisified)
                const resultados = await this.lerCSV(file);
                
                // 3. Normalização dos Dados
                const linhasValidas = this.normalizarDados(resultados.data, dataArquivo);
                
                if (linhasValidas.length > 0) {
                    this.dadosParaSalvar.push(...linhasValidas);
                    this.datasEncontradas.add(dataArquivo);
                    arquivosLidos++;
                }
            } catch (e) {
                erros.push(`Arquivo "${file.name}": ${e.message}`);
            }
        }

        // Feedback de Erros
        if (erros.length > 0) {
            alert("Alguns arquivos não puderam ser lidos:\n\n" + erros.join("\n"));
        }

        if (this.dadosParaSalvar.length === 0) {
            if(statusEl) statusEl.innerHTML = "";
            resetInput();
            return alert("Nenhum dado válido encontrado nos arquivos selecionados.");
        }

        // 4. Verificação de Duplicidade no Banco (Lote)
        await this.verificarESalvar(statusEl);
        resetInput();
    },

    // Wrapper Promessa para o PapaParse
    lerCSV: function(file) {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                encoding: "UTF-8",
                transformHeader: (h) => h.trim().replace(/"/g, '').replace(/^\ufeff/, '').toLowerCase(),
                complete: (results) => resolve(results),
                error: (err) => reject(err)
            });
        });
    },

    extrairDataDoNome: function(nome) {
        // Procura por 8 dígitos seguidos (DDMMAAAA)
        const match = nome.match(/(\d{2})(\d{2})(\d{4})/);
        if (match) {
            const dia = match[1];
            const mes = match[2];
            const ano = match[3];
            // Validação simples
            if (parseInt(mes) > 12 || parseInt(dia) > 31) return null;
            return `${ano}-${mes}-${dia}`;
        }
        return null;
    },

    normalizarDados: function(linhas, dataFixa) {
        const processados = [];
        
        for (let i = 0; i < linhas.length; i++) {
            const row = linhas[i];
            
            // Validação do ID
            let idRaw = row['id_assistente'] || row['id'] || row['usuario_id'];
            if (!idRaw || (row['assistente'] && row['assistente'].toLowerCase() === 'total')) continue;

            const usuarioId = parseInt(idRaw.toString().replace(/\D/g, ''));
            if (!usuarioId) continue;

            // Captura de Volume
            let quantidade = 0;
            if (row['documentos_validados']) quantidade = parseInt(row['documentos_validados']) || 0;
            else if (row['quantidade'] || row['qtd']) quantidade = parseInt(row['quantidade'] || row['qtd']) || 0;
            else quantidade = 1;

            // Métricas
            const fifo = parseInt(row['fifo'] || row['documentos_validados_fifo']) || 0;
            const gTotal = parseInt(row['gradual_total'] || row['gradual total'] || row['documentos_validados_gradual_total']) || 0;
            const gParcial = parseInt(row['gradual_parcial'] || row['gradual parcial'] || row['documentos_validados_gradual_parcial']) || 0;
            const perfilFc = parseInt(row['perfil_fc'] || row['perfil fc'] || row['documentos_validados_perfil_fc']) || 0;

            // Status
            let statusFinal = 'OK';
            if (row['status']) {
                const s = row['status'].toUpperCase();
                if (s.includes('NOK') || s.includes('ERRO')) statusFinal = 'NOK';
            }

            processados.push({
                usuario_id: usuarioId,
                data_referencia: dataFixa, // Data específica deste arquivo
                quantidade: quantidade,
                status: statusFinal,
                fifo: fifo,
                gradual_total: gTotal,
                gradual_parcial: gParcial,
                perfil_fc: perfilFc,
                fator: 1
            });
        }
        return processados;
    },

    verificarESalvar: async function(statusEl) {
        if(statusEl) statusEl.innerHTML = `<span class="text-purple-600"><i class="fas fa-search"></i> Verificando duplicidade...</span>`;

        // Transforma o Set de datas em Array para consulta
        const datasArray = Array.from(this.datasEncontradas);
        
        // Verifica se JÁ existem dados para ESSAS datas
        const { data: existentes, error } = await Sistema.supabase
            .from('producao')
            .select('data_referencia')
            .in('data_referencia', datasArray);

        if (error) {
            console.error(error);
            if(statusEl) statusEl.innerHTML = "";
            return alert("Erro ao verificar banco de dados: " + error.message);
        }

        // Filtra datas únicas que retornaram do banco
        const datasComDados = new Set(existentes.map(d => d.data_referencia));
        
        let msgAviso = "";
        let deveLimpar = false;

        if (datasComDados.size > 0) {
            // Formata datas para exibir (AAAA-MM-DD -> DD/MM/AAAA)
            const datasFormatadas = Array.from(datasComDados).map(d => d.split('-').reverse().join('/')).join(', ');
            msgAviso = `\n⚠️ ATENÇÃO: Já existem registros para as datas: \n[ ${datasFormatadas} ]\n\nOs dados destas datas serão APAGADOS e substituídos.`;
            deveLimpar = true;
        }

        const datasNovasFormatadas = datasArray.map(d => d.split('-').reverse().join('/')).join(', ');
        const msg = `Resumo da Importação em Massa:\n\n` +
                    `📅 Datas Detectadas: ${datasNovasFormatadas}\n` +
                    `📊 Total de Registros: ${this.dadosParaSalvar.length}\n` +
                    msgAviso + `\n\n` +
                    `Confirmar gravação no banco de dados?`;

        if (!confirm(msg)) {
            if(statusEl) statusEl.innerHTML = "";
            return;
        }

        await this.salvarNoBanco(deveLimpar, datasArray, statusEl);
    },

    salvarNoBanco: async function(deveLimpar, datasArray, statusEl) {
        // 1. Limpeza (Delete) dos dias afetados
        if (deveLimpar) {
            if(statusEl) statusEl.innerHTML = `<span class="text-rose-500 font-bold">🗑️ Limpando dados antigos...</span>`;
            
            const { error: errDel } = await Sistema.supabase
                .from('producao')
                .delete()
                .in('data_referencia', datasArray);
                
            if (errDel) {
                alert("Erro ao limpar dados antigos: " + errDel.message);
                if(statusEl) statusEl.innerHTML = "";
                return;
            }
        }

        // 2. Inserção (Insert)
        const payload = this.dadosParaSalvar;
        const total = payload.length;
        const BATCH_SIZE = 1000;
        let enviados = 0;

        if(statusEl) statusEl.innerHTML = `<span class="text-orange-500 font-bold">Enviando dados...</span>`;
        
        for (let i = 0; i < total; i += BATCH_SIZE) {
            const chunk = payload.slice(i, i + BATCH_SIZE);
            const { error } = await Sistema.supabase
                .from('producao')
                .insert(chunk);
            
            if (error) {
                console.error(error);
                if(statusEl) statusEl.innerHTML = "";
                alert("Erro ao salvar lote: " + error.message);
                return;
            }
            
            enviados += chunk.length;
            if(statusEl) {
                const pct = Math.round((enviados/total)*100);
                statusEl.innerHTML = `<span class="text-orange-600 font-bold"><i class="fas fa-circle-notch fa-spin"></i> ${pct}%</span>`;
            }
        }

        if(statusEl) statusEl.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fas fa-check"></i> Sucesso!</span>`;
        
        setTimeout(() => { 
            if(statusEl) statusEl.innerHTML = ""; 
        }, 3000);
        
        alert(`Sucesso! ${total} registros importados em ${datasArray.length} datas.`);
        
        // Atualiza a tela com a primeira data encontrada, só para dar feedback visual
        if (Produtividade.Geral && Produtividade.Geral.carregarTela && datasArray.length > 0) {
            // Ordena para pegar a data mais recente ou a primeira
            datasArray.sort();
            const dataAlvo = datasArray[0]; 
            const [ano, mes, dia] = dataAlvo.split('-');

            const elDia = document.getElementById('sel-data-dia');
            const elMes = document.getElementById('sel-mes');
            const elAno = document.getElementById('sel-ano');

            // Ajusta o filtro visual para o usuário ver ALGO que acabou de importar
            if (elDia) elDia.value = dataAlvo;
            if (elMes) elMes.value = parseInt(mes) - 1; 
            if (elAno) elAno.value = ano;
            
            Produtividade.Geral.carregarTela();
        }
    }
};